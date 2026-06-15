import Link from "next/link";

export default function Home() {
  return (
    <main className="flex items-center justify-center min-h-screen bg-gradient-to-br from-gray-900 to-black">
      <div className="text-center max-w-2xl px-4">
        <h1 className="text-5xl font-bold text-white mb-4">
          Joint Angle Tracker
        </h1>
        <p className="text-gray-300 text-lg mb-8">
          Real-time pose detection and joint angle measurement using your
          camera. Track knee and elbow angles with live visual feedback.
        </p>

        <div className="space-y-4 mb-8">
          <div className="flex items-center justify-center gap-3 text-gray-200">
            <span className="text-2xl">📷</span>
            <p>Uses your device camera (rear camera preferred)</p>
          </div>
          <div className="flex items-center justify-center gap-3 text-gray-200">
            <span className="text-2xl">🧠</span>
            <p>MoveNet pose detection powered by TensorFlow.js</p>
          </div>
          <div className="flex items-center justify-center gap-3 text-gray-200">
            <span className="text-2xl">⚡</span>
            <p>100% client-side processing, no data sent anywhere</p>
          </div>
        </div>

        <Link
          href="/joint-tracker"
          className="inline-block px-8 py-4 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition shadow-lg text-lg"
        >
          Start Tracking
        </Link>

        <div className="mt-12 text-gray-400 text-sm space-y-2">
          <p>✓ Tracks both knees and both elbows</p>
          <p>✓ Color-coded angle feedback (green/yellow/red)</p>
          <p>✓ Real-time skeleton overlay</p>
          <p>✓ Full privacy - nothing is saved</p>
        </div>
      </div>
    </main>
  );
}
