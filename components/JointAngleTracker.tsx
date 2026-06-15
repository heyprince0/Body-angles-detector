"use client";

import { useEffect, useRef, useState } from "react";

interface Keypoint {
  x: number;
  y: number;
  score: number;
}

interface AngleData {
  leftKnee: number | null;
  rightKnee: number | null;
  leftElbow: number | null;
  rightElbow: number | null;
}

interface JointRange {
  green: number;
  yellow: number;
}

// Configurable thresholds for different joints
const JOINT_RANGES: Record<string, JointRange> = {
  knee: { green: 90, yellow: 120 },
  elbow: { green: 60, yellow: 130 },
};

// MoveNet keypoint indices (17-point model)
const KEYPOINT_INDICES = {
  left_shoulder: 5,
  right_shoulder: 6,
  left_elbow: 7,
  right_elbow: 8,
  left_wrist: 9,
  right_wrist: 10,
  left_hip: 11,
  right_hip: 12,
  left_knee: 13,
  right_knee: 14,
  left_ankle: 15,
  right_ankle: 16,
};

// Skeleton connections for drawing
const SKELETON_CONNECTIONS = [
  [5, 6],   // shoulders
  [5, 7],   // left shoulder -> left elbow
  [7, 9],   // left elbow -> left wrist
  [6, 8],   // right shoulder -> right elbow
  [8, 10],  // right elbow -> right wrist
  [5, 11],  // left shoulder -> left hip
  [6, 12],  // right shoulder -> right hip
  [11, 12], // left hip -> right hip
  [11, 13], // left hip -> left knee
  [13, 15], // left knee -> left ankle
  [12, 14], // right hip -> right knee
  [14, 16], // right knee -> right ankle
];

// Calculate angle between three points using atan2
function calculateAngle(
  point1: Keypoint,
  point2: Keypoint,
  point3: Keypoint
): number | null {
  // Check if all points have sufficient confidence
  if (point1.score < 0.5 || point2.score < 0.5 || point3.score < 0.5) {
    return null;
  }

  // angle = atan2(p3.y - p2.y, p3.x - p2.x) - atan2(p1.y - p2.y, p1.x - p2.x)
  const angle1 = Math.atan2(point1.y - point2.y, point1.x - point2.x);
  const angle2 = Math.atan2(point3.y - point2.y, point3.x - point2.x);

  let angle = angle2 - angle1;
  angle = (angle * 180) / Math.PI;

  // Normalize to 0-180 range
  if (angle < 0) angle += 360;
  if (angle > 180) angle = 360 - angle;

  return Math.abs(angle);
}

// Get color based on angle value and joint type
function getAngleColor(angle: number, jointType: "knee" | "elbow"): string {
  const range = JOINT_RANGES[jointType];
  if (angle < range.green) return "#22c55e"; // green
  if (angle < range.yellow) return "#eab308"; // yellow
  return "#ef4444"; // red
}

export default function JointAngleTracker() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const detectorRef = useRef<any>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [angles, setAngles] = useState<AngleData>({
    leftKnee: null,
    rightKnee: null,
    leftElbow: null,
    rightElbow: null,
  });

  // Initialize TensorFlow and load model
  useEffect(() => {
    const initializePoseDetection = async () => {
      try {
        // Dynamically import modules to avoid build-time issues
        const tf = await import("@tensorflow/tfjs-core");
        await import("@tensorflow/tfjs-backend-webgl");
        const { createDetector, SupportedModels } = await import(
          "@tensorflow-models/pose-detection"
        );

        // Set backend to webgl
        await tf.setBackend("webgl");
        await tf.ready();

        // Load MoveNet detector
        const detector = await createDetector(SupportedModels.MoveNet, {
          modelType: "SinglePose.Lightning",
        });

        detectorRef.current = detector;
        setLoading(false);
      } catch (err) {
        console.error("[v0] Failed to initialize pose detection:", err);
        setError(
          "Failed to load pose model. Please refresh the page and try again."
        );
        setLoading(false);
      }
    };

    initializePoseDetection();
  }, []);

  // Request camera access
  useEffect(() => {
    if (!loading && !error) {
      const requestCamera = async () => {
        try {
          const constraints: MediaStreamConstraints = {
            video: {
              facingMode: { ideal: "environment" },
              width: { ideal: 640 },
              height: { ideal: 480 },
            },
          };

          try {
            const stream = await navigator.mediaDevices.getUserMedia(
              constraints
            );
            if (videoRef.current) {
              videoRef.current.srcObject = stream;
            }
          } catch (envError) {
            // Fallback to user camera if environment camera not available
            const fallbackConstraints: MediaStreamConstraints = {
              video: {
                facingMode: "user",
                width: { ideal: 640 },
                height: { ideal: 480 },
              },
            };
            const stream =
              await navigator.mediaDevices.getUserMedia(fallbackConstraints);
            if (videoRef.current) {
              videoRef.current.srcObject = stream;
            }
          }
        } catch (err) {
          console.error("[v0] Camera access error:", err);
          setError("Camera access denied. Please enable camera permissions.");
        }
      };

      requestCamera();
    }

    return () => {
      // Clean up camera stream on unmount
      if (videoRef.current && videoRef.current.srcObject) {
        const tracks = (
          videoRef.current.srcObject as MediaStream
        ).getTracks();
        tracks.forEach((track) => track.stop());
      }
    };
  }, [loading, error]);

  // Video loaded handler
  const handleVideoLoadedMetadata = () => {
    if (videoRef.current && canvasRef.current) {
      const width = videoRef.current.videoWidth;
      const height = videoRef.current.videoHeight;

      canvasRef.current.width = width;
      canvasRef.current.height = height;

      // Start pose detection loop
      startPoseDetectionLoop();
    }
  };

  // Main pose detection loop
  const startPoseDetectionLoop = async () => {
    const detectPose = async () => {
      if (
        !videoRef.current ||
        !canvasRef.current ||
        !detectorRef.current ||
        videoRef.current.readyState !== 4
      ) {
        animationRef.current = requestAnimationFrame(detectPose);
        return;
      }

      try {
        const poses = await detectorRef.current.estimatePoses(
          videoRef.current
        );

        // Draw on canvas
        drawPoses(poses);

        // Calculate angles
        if (poses.length > 0) {
          const keypoints = poses[0].keypoints;
          const newAngles: AngleData = {
            leftKnee: null,
            rightKnee: null,
            leftElbow: null,
            rightElbow: null,
          };

          // Calculate left knee angle
          const leftHip = keypoints[KEYPOINT_INDICES.left_hip];
          const leftKnee = keypoints[KEYPOINT_INDICES.left_knee];
          const leftAnkle = keypoints[KEYPOINT_INDICES.left_ankle];
          newAngles.leftKnee = calculateAngle(leftHip, leftKnee, leftAnkle);

          // Calculate right knee angle
          const rightHip = keypoints[KEYPOINT_INDICES.right_hip];
          const rightKnee = keypoints[KEYPOINT_INDICES.right_knee];
          const rightAnkle = keypoints[KEYPOINT_INDICES.right_ankle];
          newAngles.rightKnee = calculateAngle(rightHip, rightKnee, rightAnkle);

          // Calculate left elbow angle
          const leftShoulder = keypoints[KEYPOINT_INDICES.left_shoulder];
          const leftElbow = keypoints[KEYPOINT_INDICES.left_elbow];
          const leftWrist = keypoints[KEYPOINT_INDICES.left_wrist];
          newAngles.leftElbow = calculateAngle(
            leftShoulder,
            leftElbow,
            leftWrist
          );

          // Calculate right elbow angle
          const rightShoulder = keypoints[KEYPOINT_INDICES.right_shoulder];
          const rightElbow = keypoints[KEYPOINT_INDICES.right_elbow];
          const rightWrist = keypoints[KEYPOINT_INDICES.right_wrist];
          newAngles.rightElbow = calculateAngle(
            rightShoulder,
            rightElbow,
            rightWrist
          );

          setAngles(newAngles);
        }
      } catch (err) {
        console.error("[v0] Pose detection error:", err);
      }

      animationRef.current = requestAnimationFrame(detectPose);
    };

    animationRef.current = requestAnimationFrame(detectPose);
  };

  // Draw poses and keypoints on canvas
  const drawPoses = (poses: any[]) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    poses.forEach((pose) => {
      // Draw skeleton connections
      ctx.strokeStyle = "rgba(100, 200, 255, 0.6)";
      ctx.lineWidth = 2;

      SKELETON_CONNECTIONS.forEach(([startIdx, endIdx]) => {
        const start = pose.keypoints[startIdx];
        const end = pose.keypoints[endIdx];

        if (start.score > 0.5 && end.score > 0.5) {
          ctx.beginPath();
          ctx.moveTo(start.x, start.y);
          ctx.lineTo(end.x, end.y);
          ctx.stroke();
        }
      });

      // Draw keypoints
      pose.keypoints.forEach((keypoint: Keypoint) => {
        if (keypoint.score > 0.5) {
          ctx.fillStyle = "rgba(255, 100, 100, 0.8)";
          ctx.beginPath();
          ctx.arc(keypoint.x, keypoint.y, 4, 0, 2 * Math.PI);
          ctx.fill();
        }
      });
    });
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      if (videoRef.current && videoRef.current.srcObject) {
        const tracks = (
          videoRef.current.srcObject as MediaStream
        ).getTracks();
        tracks.forEach((track) => track.stop());
      }
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center w-full h-screen bg-black">
        <div className="text-center">
          <div className="mb-4 flex justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
          </div>
          <p className="text-white text-lg">Loading pose model...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center w-full h-screen bg-black">
        <div className="text-center max-w-md">
          <p className="text-red-500 text-lg mb-4">{error}</p>
          <button
            onClick={() => {
              setError(null);
              window.location.reload();
            }}
            className="px-4 py-2 bg-white text-black font-semibold rounded hover:bg-gray-200 transition"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-screen bg-black flex items-center justify-center overflow-hidden">
      <div className="relative w-full h-full max-w-2xl flex items-center justify-center">
        {/* Video and Canvas Container */}
        <div className="relative w-full h-full bg-gray-900 rounded-lg shadow-2xl overflow-hidden">
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            onLoadedMetadata={handleVideoLoadedMetadata}
            className="w-full h-full object-cover"
          />

          <canvas
            ref={canvasRef}
            className="absolute top-0 left-0 w-full h-full"
          />

          {/* Angle Readouts - 2x2 Grid */}
          <div className="absolute top-4 left-4 right-4 grid grid-cols-2 gap-3 pointer-events-none">
            {/* Left Knee */}
            <AngleReadout
              label="Left Knee"
              angle={angles.leftKnee}
              jointType="knee"
            />

            {/* Right Knee */}
            <AngleReadout
              label="Right Knee"
              angle={angles.rightKnee}
              jointType="knee"
            />

            {/* Left Elbow */}
            <AngleReadout
              label="Left Elbow"
              angle={angles.leftElbow}
              jointType="elbow"
            />

            {/* Right Elbow */}
            <AngleReadout
              label="Right Elbow"
              angle={angles.rightElbow}
              jointType="elbow"
            />
          </div>

          {/* Legend - Bottom */}
          <div className="absolute bottom-4 left-4 right-4 bg-black bg-opacity-60 text-white text-xs rounded p-3 pointer-events-none">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-green-500"></div>
                <span>
                  Knee: &lt;90°, Elbow: &lt;60°
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                <span>
                  Knee: 90-120°, Elbow: 60-130°
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500"></div>
                <span>
                  Knee: &gt;120°, Elbow: &gt;130°
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface AngleReadoutProps {
  label: string;
  angle: number | null;
  jointType: "knee" | "elbow";
}

function AngleReadout({ label, angle, jointType }: AngleReadoutProps) {
  const color = angle !== null ? getAngleColor(angle, jointType) : "#9ca3af";

  return (
    <div className="bg-black bg-opacity-60 rounded p-3 text-center">
      <p className="text-gray-300 text-xs font-medium mb-1">{label}</p>
      <p
        className="text-2xl font-bold"
        style={{
          color: color,
          textShadow: "0 2px 4px rgba(0, 0, 0, 0.8)",
        }}
      >
        {angle !== null ? `${Math.round(angle)}°` : "Tracking lost"}
      </p>
    </div>
  );
}
