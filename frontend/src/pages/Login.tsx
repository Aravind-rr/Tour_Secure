import { useState } from "react";
import { useAuth } from "@/context/AuthContext";

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState("demo@example.com"); // change as needed
  const [password, setPassword] = useState("demopass");    // change as needed
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await login(email, password);
      // optional: navigate to home
      window.location.href = "/";
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-sm mx-auto p-6">
      <h1 className="text-xl font-semibold mb-4">Sign in</h1>
      <form className="grid gap-3" onSubmit={handleSubmit}>
        <input
          className="border rounded px-3 py-2"
          placeholder="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          className="border rounded px-3 py-2"
          placeholder="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button
          className="px-3 py-2 rounded bg-black text-white disabled:opacity-60"
          disabled={busy}
        >
          {busy ? "Signing in..." : "Sign in"}
        </button>
        {error && <div className="text-sm text-red-600">{error}</div>}
      </form>
    </div>
  );
}
