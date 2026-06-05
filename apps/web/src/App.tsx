import { useState } from 'react';
import './App.css';

const SCHEDULING_URL =
  import.meta.env.VITE_SCHEDULING_URL ?? 'http://localhost:3000';

interface IntentParams {
  [key: string]: unknown;
}

interface Intent {
  kind: string;
  params: IntentParams;
}

interface IntentResponse {
  intent: Intent;
  confidence: number;
}

function App() {
  const [message, setMessage] = useState('');
  const [result, setResult] = useState<IntentResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch(`${SCHEDULING_URL}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(body.error ?? `Request failed: ${response.status}`);
        return;
      }

      const data: IntentResponse = await response.json();
      setResult(data);
    } catch {
      setError('Could not reach scheduling service.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={{ fontFamily: 'sans-serif', textAlign: 'center', padding: '4rem' }}>
      <h1>HealthSync</h1>
      <p>Tell it what happened — it reschedules the rest.</p>

      <form onSubmit={handleSubmit} style={{ marginTop: '2rem' }}>
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="e.g. Push my 3pm back 30 minutes"
          style={{ padding: '0.5rem', width: '320px', fontSize: '1rem' }}
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading || !message.trim()}
          style={{ marginLeft: '0.5rem', padding: '0.5rem 1rem', fontSize: '1rem' }}
        >
          {loading ? 'Sending...' : 'Submit'}
        </button>
      </form>

      {error && (
        <p style={{ color: 'red', marginTop: '1rem' }}>Error: {error}</p>
      )}

      {result && (
        <div style={{ marginTop: '1.5rem', textAlign: 'left', display: 'inline-block' }}>
          <h2>Intent</h2>
          <p>
            <strong>Kind:</strong> {result.intent.kind}
          </p>
          <p>
            <strong>Params:</strong>{' '}
            {Object.entries(result.intent.params)
              .map(([k, v]) => `${k}: ${v}`)
              .join(', ')}
          </p>
          <p>
            <strong>Confidence:</strong> {result.confidence}
          </p>
        </div>
      )}
    </main>
  );
}

export default App;
