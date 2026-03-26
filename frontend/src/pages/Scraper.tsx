import { useState } from 'react';
import { Globe, Loader2, Mail, Copy, Check, Users, Wrench, Code, FileText, ArrowRight } from 'lucide-react';
import { scrapeUrl, type ScrapeResult } from '../lib/api';
import { cn } from '../lib/utils';
import { useToast } from '../lib/toast';

interface ScrapeHistoryItem {
  url: string;
  result: ScrapeResult;
  scrapedAt: Date;
}

export function Scraper() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScrapeResult | null>(null);
  const [history, setHistory] = useState<ScrapeHistoryItem[]>([]);
  const [copiedEmail, setCopiedEmail] = useState<string | null>(null);
  const { toast } = useToast();

  async function handleScrape() {
    if (!url.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      let cleanUrl = url.trim();
      if (!cleanUrl.startsWith('http')) cleanUrl = 'https://' + cleanUrl;
      const data = await scrapeUrl(cleanUrl);
      setResult(data);
      setHistory(prev => [{ url: cleanUrl, result: data, scrapedAt: new Date() }, ...prev.slice(0, 19)]);
    } catch (err: any) {
      setError(err.message || 'Scrape failed');
    } finally {
      setLoading(false);
    }
  }

  function copyEmail(email: string) {
    navigator.clipboard.writeText(email);
    setCopiedEmail(email);
    toast('Email copied');
    setTimeout(() => setCopiedEmail(null), 2000);
  }

  function copyAllEmails() {
    if (!result?.emails.length) return;
    navigator.clipboard.writeText(result.emails.join(', '));
    toast(`Copied ${result.emails.length} email${result.emails.length > 1 ? 's' : ''}`);
  }

  function loadFromHistory(item: ScrapeHistoryItem) {
    setUrl(item.url);
    setResult(item.result);
    setError(null);
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-zinc-100">Email Scraper</h1>
        <p className="text-sm text-zinc-500 mt-0.5">Paste any contractor website URL to extract emails and contact info</p>
      </div>

      {/* Search bar */}
      <div className="flex gap-2 mb-6">
        <div className="relative flex-1">
          <Globe className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600 pointer-events-none" />
          <input
            type="text"
            value={url}
            onChange={e => setUrl(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleScrape()}
            placeholder="https://example-hvac.com"
            className="w-full bg-zinc-900 border border-white/[0.06] rounded-lg pl-10 pr-4 py-3 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-orange-500/40 focus:border-orange-500/30 transition-colors"
          />
        </div>
        <button
          onClick={handleScrape}
          disabled={loading || !url.trim()}
          className="flex items-center gap-2 px-5 py-3 bg-orange-500 hover:bg-orange-400 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm rounded-lg transition-colors shadow-[0_0_16px_-4px_rgba(249,115,22,0.5)]"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
          Scrape
        </button>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-4">
          {/* Emails card */}
          <div className="bg-zinc-900 rounded-xl border border-white/[0.06] shadow-surface overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.04]">
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-orange-400" />
                <span className="text-sm font-semibold text-zinc-200">
                  Emails ({result.emails.length})
                </span>
              </div>
              {result.emails.length > 1 && (
                <button
                  onClick={copyAllEmails}
                  className="text-xs text-zinc-400 hover:text-orange-400 transition-colors"
                >
                  Copy all
                </button>
              )}
            </div>
            <div className="p-5">
              {result.emails.length > 0 ? (
                <div className="space-y-2">
                  {result.emails.map(email => (
                    <div key={email} className="flex items-center justify-between bg-zinc-800/50 rounded-lg px-4 py-2.5 border border-white/[0.04]">
                      <a href={`mailto:${email}`} className="text-sm text-orange-400 hover:text-orange-300 transition-colors">
                        {email}
                      </a>
                      <button
                        onClick={() => copyEmail(email)}
                        className="text-zinc-500 hover:text-zinc-300 transition-colors"
                      >
                        {copiedEmail === email ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-zinc-600">No emails found on this website</p>
              )}
            </div>
          </div>

          {/* Info grid */}
          <div className="grid grid-cols-2 gap-4">
            {/* Team names */}
            <InfoCard icon={Users} title="Team Members" items={result.team_names} />

            {/* Services */}
            <InfoCard icon={Wrench} title="Services Detected" items={result.services} />

            {/* Tech stack */}
            <InfoCard icon={Code} title="Tech Stack" items={result.tech_stack} />

            {/* Contact form */}
            <div className="bg-zinc-900 rounded-xl border border-white/[0.06] shadow-surface p-5">
              <div className="flex items-center gap-2 mb-3">
                <FileText className="w-4 h-4 text-zinc-500" />
                <span className="text-sm font-semibold text-zinc-200">Contact Form</span>
              </div>
              <span className={cn(
                'inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium',
                result.has_contact_form
                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
                  : 'bg-zinc-800 text-zinc-500 border border-white/[0.04]',
              )}>
                {result.has_contact_form ? 'Has contact form' : 'No contact form found'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* History */}
      {history.length > 0 && (
        <div className="mt-8">
          <h3 className="text-sm font-semibold text-zinc-400 mb-3">Recent Scrapes</h3>
          <div className="space-y-1">
            {history.map((item, i) => (
              <button
                key={i}
                onClick={() => loadFromHistory(item)}
                className="w-full flex items-center justify-between px-4 py-2.5 rounded-lg text-left hover:bg-zinc-900 transition-colors group"
              >
                <span className="text-sm text-zinc-400 group-hover:text-zinc-200 truncate">{item.url}</span>
                <div className="flex items-center gap-3 flex-shrink-0">
                  {item.result.emails.length > 0 && (
                    <span className="text-xs text-orange-400 font-data">{item.result.emails.length} email{item.result.emails.length > 1 ? 's' : ''}</span>
                  )}
                  <span className="text-[10px] text-zinc-600">
                    {item.scrapedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function InfoCard({ icon: Icon, title, items }: { icon: any; title: string; items: string[] }) {
  return (
    <div className="bg-zinc-900 rounded-xl border border-white/[0.06] shadow-surface p-5">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4 text-zinc-500" />
        <span className="text-sm font-semibold text-zinc-200">{title}</span>
        {items.length > 0 && <span className="text-xs text-zinc-600 font-data">({items.length})</span>}
      </div>
      {items.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {items.map((item, i) => (
            <span key={i} className="text-xs bg-zinc-800/60 text-zinc-400 px-2.5 py-1 rounded-md border border-white/[0.04]">
              {item}
            </span>
          ))}
        </div>
      ) : (
        <p className="text-sm text-zinc-600">None detected</p>
      )}
    </div>
  );
}
