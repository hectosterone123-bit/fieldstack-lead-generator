import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Bot, Loader2 } from 'lucide-react';
import { fetchDemoRecording } from '../lib/api';
import type { DemoRecordingData } from '../lib/api';

const SERVICE_LABEL: Record<string, string> = {
  hvac: 'HVAC',
  roofing: 'Roofing',
  plumbing: 'Plumbing',
  electrical: 'Electrical',
  landscaping: 'Landscaping',
  pest_control: 'Pest Control',
  general: 'General Contracting',
};

export function DemoRecording() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<DemoRecordingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    fetchDemoRecording(token)
      .then(setData)
      .catch(err => setError(err.message || 'Recording not found'))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-orange-400 animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center gap-3">
        <Bot className="w-8 h-8 text-zinc-600" />
        <p className="text-sm text-zinc-400">{error || 'Recording not found'}</p>
      </div>
    );
  }

  const dateStr = new Date(data.created_at).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center py-8 px-4">
      {/* Header */}
      <div className="w-full max-w-md mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-full bg-orange-500/10 border border-orange-500/20 flex items-center justify-center">
            <Bot className="w-5 h-5 text-orange-400" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-zinc-100">Sam AI Demo</h1>
            <p className="text-xs text-zinc-500">
              {data.contractor_name} · {SERVICE_LABEL[data.service_type] || data.service_type} · {data.city}
            </p>
          </div>
        </div>
        <p className="text-[10px] text-zinc-600 ml-[52px]">{dateStr}</p>
      </div>

      {/* Chat */}
      <div className="w-full max-w-md bg-zinc-900 border border-white/[0.06] rounded-2xl overflow-hidden">
        {/* Chat header */}
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-white/[0.04]">
          <div className="w-7 h-7 rounded-full bg-orange-500/10 border border-orange-500/20 flex items-center justify-center">
            <Bot className="w-3.5 h-3.5 text-orange-400" />
          </div>
          <div>
            <p className="text-sm font-medium text-zinc-200">Sam @ {data.contractor_name}</p>
            <p className="text-[10px] text-zinc-500">SMS conversation replay</p>
          </div>
        </div>

        {/* Messages */}
        <div className="p-4 space-y-3">
          {data.messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === 'homeowner' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[75%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                  msg.role === 'homeowner'
                    ? 'bg-blue-600 text-white rounded-br-sm'
                    : 'bg-zinc-800 text-zinc-200 rounded-bl-sm'
                }`}
              >
                {msg.text}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="mt-8 text-center">
        <p className="text-xs text-zinc-600">
          Powered by <span className="text-orange-400 font-medium">Sam AI</span> · FieldStack
        </p>
        <p className="text-[10px] text-zinc-700 mt-1">
          Respond to every lead in under 60 seconds. Automatically.
        </p>
      </div>
    </div>
  );
}
