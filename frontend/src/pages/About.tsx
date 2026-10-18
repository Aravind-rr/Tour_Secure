export default function About() {
  const features: Array<[string, string]> = [
    ["🛡️ Safety scores & geo-fencing", "Zone risk, area scores from reviews, and time-of-day adjustments for any point."],
    ["🧭 Explore", "Category-wise recommendations (historic, entertainment, fun, food, nature, spiritual, shopping) near you or around your itinerary — low-safety places can be hidden."],
    ["🗓️ Trip planner", "Day-by-day, timed plans with meals and travel estimates that save straight into your itinerary."],
    ["🤖 AI assistant", "Chat for places, plans, safety and emergencies. Uses Claude when configured, otherwise an offline engine grounded in app data."],
    ["🚨 SOS with live tracking", "Cancellable SOS that shares a live-location link with your emergency contacts via WhatsApp/SMS."],
    ["⏱️ Safe check-in", "Set a timer before risky stretches; if you don't check in, an alert is raised automatically."],
    ["📝 e-FIR & Digital ID", "File reports online and carry a verifiable, time-bound tourist ID with QR."],
  ];
  return (
    <div className="grid gap-6">
      <div className="card card-body">
        <h1 className="text-2xl font-bold mb-2">About Tour Secure</h1>
        <p className="text-sm text-slate-600">
          A smart tourist safety platform combining geo-fencing, anomaly detection, e-FIR, a blockchain-backed Digital ID, safety-aware travel
          recommendations and an AI assistant.
        </p>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {features.map(([t, d]) => (
            <li key={t} className="rounded-xl border p-3">
              <div className="font-medium">{t}</div>
              <div className="text-sm text-neutral-600">{d}</div>
            </li>
          ))}
        </ul>
      </div>
      <div className="card card-body">
        <h2 className="font-semibold mb-2">Disclaimer</h2>
        <p className="text-sm">
          This is an MVP for research and demonstration. Safety scores are estimates and the assistant can make mistakes — in an emergency call 112. Do not use in
          production without review and hardening.
        </p>
      </div>
    </div>
  );
}
