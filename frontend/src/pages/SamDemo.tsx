import { useState, useRef, useEffect, useCallback } from 'react';
import { Bot, MessageSquare, FileText, Send, Copy, RotateCcw, Loader2, ChevronRight, Download, Mail, X, Link2, Check } from 'lucide-react';
import { simulateSamSms, generateProposal, sendProposalEmail, saveDemoRecording } from '../lib/api';
import type { SamMessage, SamContractor, ProposalResult } from '../lib/api';
import { useToast } from '../lib/toast';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

const SERVICE_TYPES = [
  { value: 'hvac', label: 'HVAC' },
  { value: 'roofing', label: 'Roofing' },
  { value: 'plumbing', label: 'Plumbing' },
  { value: 'electrical', label: 'Electrical' },
  { value: 'landscaping', label: 'Landscaping' },
  { value: 'pest_control', label: 'Pest Control' },
  { value: 'general', label: 'General Contracting' },
];

const SERVICE_LABEL: Record<string, string> = Object.fromEntries(SERVICE_TYPES.map(s => [s.value, s.label]));

function fmt(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

// ─── SMS Simulator ────────────────────────────────────────────────────────────

function SmsSimulator() {
  const { toast } = useToast();
  const [contractor, setContractor] = useState<SamContractor>({ name: '', service_type: 'hvac', city: '' });
  const [started, setStarted] = useState(false);
  const [messages, setMessages] = useState<SamMessage[]>([]);
  const [input, setInput] = useState('');
  const [generating, setGenerating] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function handleShare() {
    if (sharing || !messages.length) return;
    setSharing(true);
    try {
      const result = await saveDemoRecording(contractor, messages);
      const fullUrl = `${window.location.origin}${result.url}`;
      await navigator.clipboard.writeText(fullUrl);
      setShareUrl(fullUrl);
      toast('Share link copied');
      setTimeout(() => setShareUrl(null), 5000);
    } catch (err: any) {
      toast(err.message || 'Failed to save recording', 'error');
    } finally {
      setSharing(false);
    }
  }

  function handleStart() {
    if (!contractor.name.trim() || !contractor.city.trim()) {
      toast('Fill in business name and city first', 'error');
      return;
    }
    setMessages([]);
    setStarted(true);
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || generating) return;
    setInput('');

    const newMessages: SamMessage[] = [...messages, { role: 'homeowner', text }];
    setMessages(newMessages);
    setGenerating(true);

    try {
      const result = await simulateSamSms(contractor, newMessages);
      setMessages(prev => [...prev, { role: 'sam', text: result.reply }]);
    } catch (err: any) {
      toast(err.message || 'Failed to get Sam reply', 'error');
    } finally {
      setGenerating(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleCopy() {
    if (!messages.length) return;
    const text = messages
      .map(m => `[${m.role === 'homeowner' ? 'Homeowner' : 'Sam'}]: ${m.text}`)
      .join('\n');
    navigator.clipboard.writeText(text);
    toast('Thread copied');
  }

  function handleReset() {
    setMessages([]);
    setStarted(false);
    setInput('');
  }

  return (
    <div className="grid grid-cols-[280px_1fr] gap-5 h-full">
      {/* Left: Setup */}
      <div className="flex flex-col gap-4">
        <div className="bg-zinc-900 border border-white/[0.06] rounded-xl p-4 space-y-4">
          <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Contractor Profile</p>

          <div className="space-y-1">
            <label className="text-xs text-zinc-500">Business Name</label>
            <input
              className="w-full bg-zinc-800 border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-orange-500/50"
              placeholder="Austin Pro HVAC"
              value={contractor.name}
              onChange={e => setContractor(c => ({ ...c, name: e.target.value }))}
              disabled={started}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs text-zinc-500">Service Type</label>
            <select
              className="w-full bg-zinc-800 border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-orange-500/50"
              value={contractor.service_type}
              onChange={e => setContractor(c => ({ ...c, service_type: e.target.value }))}
              disabled={started}
            >
              {SERVICE_TYPES.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-zinc-500">City</label>
            <input
              className="w-full bg-zinc-800 border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-orange-500/50"
              placeholder="Austin"
              value={contractor.city}
              onChange={e => setContractor(c => ({ ...c, city: e.target.value }))}
              disabled={started}
            />
          </div>

          {!started ? (
            <button
              onClick={handleStart}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-orange-500 hover:bg-orange-400 text-white text-sm font-semibold rounded-lg transition-colors"
            >
              <Bot className="w-4 h-4" />
              Start Demo
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={handleShare}
                disabled={!messages.length || sharing}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-orange-500 hover:bg-orange-400 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium rounded-lg transition-colors"
              >
                {sharing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : shareUrl ? <Check className="w-3.5 h-3.5" /> : <Link2 className="w-3.5 h-3.5" />}
                {shareUrl ? 'Copied' : 'Share'}
              </button>
              <button
                onClick={handleCopy}
                disabled={!messages.length}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed text-zinc-300 text-xs font-medium rounded-lg transition-colors"
              >
                <Copy className="w-3.5 h-3.5" />
                Copy
              </button>
              <button
                onClick={handleReset}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium rounded-lg transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset
              </button>
            </div>
          )}
        </div>

        {started && (
          <div className="bg-zinc-900 border border-white/[0.06] rounded-xl p-4">
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Demo Context</p>
            <p className="text-xs text-zinc-500 leading-relaxed">
              Sam is texting as the AI scheduling assistant for <span className="text-zinc-300">{contractor.name}</span> ({SERVICE_LABEL[contractor.service_type]} in {contractor.city}).
            </p>
            <p className="text-xs text-zinc-600 mt-2 leading-relaxed">Type as the homeowner. Sam will respond naturally.</p>
          </div>
        )}
      </div>

      {/* Right: Chat */}
      <div className="flex flex-col bg-zinc-900 border border-white/[0.06] rounded-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.04]">
          <div className="w-8 h-8 rounded-full bg-orange-500/10 border border-orange-500/20 flex items-center justify-center">
            <Bot className="w-4 h-4 text-orange-400" />
          </div>
          <div>
            <p className="text-sm font-medium text-zinc-200">{started && contractor.name ? `Sam @ ${contractor.name}` : 'Sam AI'}</p>
            <p className="text-[10px] text-zinc-500">
              {started ? (
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
                  Active demo
                </span>
              ) : 'Configure contractor profile to start'}
            </p>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
          {!started ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
              <div className="w-12 h-12 rounded-full bg-orange-500/5 border border-orange-500/10 flex items-center justify-center">
                <MessageSquare className="w-5 h-5 text-orange-500/50" />
              </div>
              <p className="text-sm text-zinc-500 max-w-[240px]">Fill in the contractor profile and click Start Demo to begin the simulation.</p>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
              <p className="text-sm text-zinc-500">Type a message as the homeowner to start the conversation.</p>
              <p className="text-xs text-zinc-600">Try: "Hi I need my AC fixed" or "I saw your ad online"</p>
            </div>
          ) : (
            messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === 'homeowner' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[70%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                    msg.role === 'homeowner'
                      ? 'bg-blue-600 text-white rounded-br-sm'
                      : 'bg-zinc-800 text-zinc-200 rounded-bl-sm'
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            ))
          )}
          {generating && (
            <div className="flex justify-start">
              <div className="bg-zinc-800 rounded-2xl rounded-bl-sm px-3.5 py-2.5">
                <Loader2 className="w-4 h-4 text-zinc-400 animate-spin" />
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        {started && (
          <div className="p-3 border-t border-white/[0.04]">
            <div className="flex gap-2 items-end">
              <textarea
                className="flex-1 bg-zinc-800 border border-white/[0.06] rounded-xl px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-orange-500/50 resize-none"
                placeholder="Type as the homeowner..."
                rows={1}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={generating}
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || generating}
                className="flex-shrink-0 w-9 h-9 flex items-center justify-center bg-orange-500 hover:bg-orange-400 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl transition-colors"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Proposal Generator ───────────────────────────────────────────────────────

function ProposalGenerator() {
  const { toast } = useToast();
  const [inputs, setInputs] = useState({
    name: '',
    service_type: 'hvac',
    city: '',
    avg_job_value: 5000,
    monthly_leads: 15,
    sam_price: 497,
  });
  const [generating, setGenerating] = useState(false);
  const [proposal, setProposal] = useState<ProposalResult | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [showEmailInput, setShowEmailInput] = useState(false);
  const [emailTo, setEmailTo] = useState('');
  const [emailSending, setEmailSending] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  const buildPdf = useCallback(async (): Promise<jsPDF | null> => {
    if (!printRef.current || !proposal) return null;

    const clone = printRef.current.cloneNode(true) as HTMLElement;
    clone.style.position = 'absolute';
    clone.style.left = '-9999px';
    clone.style.top = '0';
    clone.style.width = '700px';
    clone.style.background = '#ffffff';
    clone.style.color = '#1a1a1a';
    clone.style.padding = '32px';
    clone.style.borderRadius = '0';
    clone.style.border = 'none';
    clone.style.overflow = 'visible';
    clone.style.height = 'auto';

    // Force light theme on all children
    clone.querySelectorAll('*').forEach((el) => {
      const h = el as HTMLElement;
      const cs = getComputedStyle(h);
      if (cs.color) h.style.color = '#1a1a1a';
      if (cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)') {
        const bg = cs.backgroundColor;
        if (bg.includes('249, 115, 22') || bg.includes('orange')) {
          // Keep orange accent
        } else {
          h.style.backgroundColor = '#f5f5f5';
        }
      }
      if (cs.borderColor) h.style.borderColor = '#e5e5e5';
    });

    // Fix text colors for specific elements
    clone.querySelectorAll('[class*="text-zinc-"]').forEach(el => {
      (el as HTMLElement).style.color = '#1a1a1a';
    });
    clone.querySelectorAll('[class*="text-red-"]').forEach(el => {
      (el as HTMLElement).style.color = '#dc2626';
    });
    clone.querySelectorAll('[class*="text-amber-"]').forEach(el => {
      (el as HTMLElement).style.color = '#d97706';
    });
    clone.querySelectorAll('[class*="text-orange-"]').forEach(el => {
      (el as HTMLElement).style.color = '#ea580c';
    });

    document.body.appendChild(clone);

    try {
      const canvas = await html2canvas(clone, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const margin = 10;
      const contentW = pageW - margin * 2;

      // Header
      pdf.setFontSize(8);
      pdf.setTextColor(150);
      pdf.text('FieldStack — Growth Proposal', margin, 8);
      pdf.text(new Date().toLocaleDateString('en-US'), pageW - margin, 8, { align: 'right' });

      // Content image
      const imgW = contentW;
      const imgH = (canvas.height / canvas.width) * imgW;
      const startY = 14;
      const maxH = pageH - startY - 10;

      if (imgH <= maxH) {
        pdf.addImage(imgData, 'PNG', margin, startY, imgW, imgH);
      } else {
        pdf.addImage(imgData, 'PNG', margin, startY, imgW, maxH);
      }

      // Footer
      pdf.setFontSize(7);
      pdf.setTextColor(180);
      pdf.text('Generated by FieldStack', pageW / 2, pageH - 5, { align: 'center' });

      return pdf;
    } finally {
      document.body.removeChild(clone);
    }
  }, [proposal]);

  async function handleDownloadPdf() {
    if (pdfBusy) return;
    setPdfBusy(true);
    try {
      const pdf = await buildPdf();
      if (pdf) pdf.save(`Proposal - ${inputs.name}.pdf`);
    } catch (err: any) {
      toast(err.message || 'Failed to generate PDF', 'error');
    } finally {
      setPdfBusy(false);
    }
  }

  async function handleEmailPdf() {
    if (!emailTo.trim() || emailSending) return;
    setEmailSending(true);
    try {
      const pdf = await buildPdf();
      if (!pdf) throw new Error('Failed to build PDF');
      const base64 = pdf.output('datauristring').split(',')[1];
      await sendProposalEmail({ to: emailTo.trim(), contractor_name: inputs.name, pdf_base64: base64 });
      toast('Proposal emailed');
      setShowEmailInput(false);
      setEmailTo('');
    } catch (err: any) {
      toast(err.message || 'Failed to send email', 'error');
    } finally {
      setEmailSending(false);
    }
  }

  async function handleGenerate() {
    if (!inputs.name.trim()) {
      toast('Business name is required', 'error');
      return;
    }
    setGenerating(true);
    try {
      const result = await generateProposal(inputs);
      setProposal(result);
    } catch (err: any) {
      toast(err.message || 'Failed to generate proposal', 'error');
    } finally {
      setGenerating(false);
    }
  }

  function handleCopy() {
    if (!proposal) return;
    const text = [
      `Growth Proposal for ${inputs.name}`,
      '',
      proposal.pain_point,
      '',
      `Lead Loss Math:`,
      `- Leads ghosted/mo: ${proposal.monthly_ghosted} (${proposal.ghosted_pct}%)`,
      `- Revenue at risk: ${fmt(proposal.monthly_revenue_at_risk)}/mo`,
      `- Sam AI cost: ${fmt(proposal.sam_cost)}/mo`,
      `- ROI: ${proposal.roi_multiple} return`,
      '',
      proposal.pitch,
      '',
      ...proposal.proof_points.map(p => `• ${p}`),
      '',
      `Guarantee: If Sam doesn't book 5 quotes this month, you don't pay.`,
      '',
      proposal.cta,
    ].join('\n');
    navigator.clipboard.writeText(text);
    toast('Proposal copied');
  }

  return (
    <div className="grid grid-cols-[280px_1fr] gap-5 h-full">
      {/* Left: Inputs */}
      <div className="bg-zinc-900 border border-white/[0.06] rounded-xl p-4 space-y-4">
        <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Contractor Info</p>

        <div className="space-y-1">
          <label className="text-xs text-zinc-500">Business Name</label>
          <input
            className="w-full bg-zinc-800 border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-orange-500/50"
            placeholder="Austin Pro Roofing"
            value={inputs.name}
            onChange={e => setInputs(i => ({ ...i, name: e.target.value }))}
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs text-zinc-500">Service Type</label>
          <select
            className="w-full bg-zinc-800 border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-orange-500/50"
            value={inputs.service_type}
            onChange={e => setInputs(i => ({ ...i, service_type: e.target.value }))}
          >
            {SERVICE_TYPES.map(s => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-xs text-zinc-500">City</label>
          <input
            className="w-full bg-zinc-800 border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-orange-500/50"
            placeholder="Austin"
            value={inputs.city}
            onChange={e => setInputs(i => ({ ...i, city: e.target.value }))}
          />
        </div>

        <div className="pt-1 border-t border-white/[0.04] space-y-3">
          <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Lead Math</p>

          <div className="space-y-1">
            <label className="text-xs text-zinc-500">Avg Job Value ($)</label>
            <input
              type="number"
              className="w-full bg-zinc-800 border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-orange-500/50 [color-scheme:dark]"
              value={inputs.avg_job_value}
              onChange={e => setInputs(i => ({ ...i, avg_job_value: Number(e.target.value) }))}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs text-zinc-500">Monthly Leads (est.)</label>
            <input
              type="number"
              className="w-full bg-zinc-800 border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-orange-500/50 [color-scheme:dark]"
              value={inputs.monthly_leads}
              onChange={e => setInputs(i => ({ ...i, monthly_leads: Number(e.target.value) }))}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs text-zinc-500">Sam AI Price ($/mo)</label>
            <input
              type="number"
              className="w-full bg-zinc-800 border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-orange-500/50 [color-scheme:dark]"
              value={inputs.sam_price}
              onChange={e => setInputs(i => ({ ...i, sam_price: Number(e.target.value) }))}
            />
          </div>
        </div>

        <button
          onClick={handleGenerate}
          disabled={generating}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-orange-500 hover:bg-orange-400 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors"
        >
          {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
          {generating ? 'Generating...' : 'Generate Proposal'}
        </button>
      </div>

      {/* Right: Rendered Proposal */}
      <div className="flex flex-col overflow-hidden">
        {!proposal ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center bg-zinc-900 border border-white/[0.06] rounded-xl">
            <div className="w-12 h-12 rounded-full bg-orange-500/5 border border-orange-500/10 flex items-center justify-center">
              <FileText className="w-5 h-5 text-orange-500/50" />
            </div>
            <p className="text-sm text-zinc-500 max-w-[240px]">Fill in the contractor details and click Generate Proposal.</p>
          </div>
        ) : (
          <>
            {/* Action buttons */}
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium rounded-lg transition-colors"
              >
                <Copy className="w-3.5 h-3.5" />
                Copy
              </button>
              <button
                onClick={handleDownloadPdf}
                disabled={pdfBusy}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-300 text-xs font-medium rounded-lg transition-colors"
              >
                {pdfBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                Download PDF
              </button>
              {!showEmailInput ? (
                <button
                  onClick={() => setShowEmailInput(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium rounded-lg transition-colors"
                >
                  <Mail className="w-3.5 h-3.5" />
                  Email PDF
                </button>
              ) : (
                <div className="flex items-center gap-1.5">
                  <input
                    type="email"
                    placeholder="recipient@email.com"
                    value={emailTo}
                    onChange={e => setEmailTo(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleEmailPdf()}
                    className="bg-zinc-800 border border-white/[0.06] rounded-lg px-2.5 py-1.5 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-orange-500/50 w-48"
                    autoFocus
                  />
                  <button
                    onClick={handleEmailPdf}
                    disabled={!emailTo.trim() || emailSending}
                    className="flex items-center gap-1 px-2.5 py-1.5 bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors"
                  >
                    {emailSending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    Send
                  </button>
                  <button
                    onClick={() => { setShowEmailInput(false); setEmailTo(''); }}
                    className="p-1 text-zinc-500 hover:text-zinc-300"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-300 text-xs font-medium rounded-lg transition-colors ml-auto"
              >
                <RotateCcw className={`w-3.5 h-3.5 ${generating ? 'animate-spin' : ''}`} />
                Regenerate
              </button>
            </div>

            {/* Proposal card */}
            <div ref={printRef} className="flex-1 overflow-y-auto bg-zinc-900 border border-white/[0.06] rounded-xl p-6 space-y-5">
              {/* Header */}
              <div>
                <p className="text-xs text-orange-400 font-semibold uppercase tracking-wider mb-1">Growth Proposal</p>
                <h2 className="text-xl font-bold text-zinc-100">{inputs.name}</h2>
                <p className="text-sm text-zinc-500">{SERVICE_LABEL[inputs.service_type]} · {inputs.city || 'Texas'}</p>
              </div>

              {/* Pain point */}
              <div className="bg-zinc-800/60 border border-white/[0.04] rounded-lg p-4">
                <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">The Problem</p>
                <p className="text-sm text-zinc-200 leading-relaxed">{proposal.pain_point}</p>
              </div>

              {/* Lead Loss Math */}
              <div>
                <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Lead Loss Math</p>
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-zinc-800/60 border border-white/[0.04] rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-red-400 font-data">{proposal.monthly_ghosted}</p>
                    <p className="text-xs text-zinc-500 mt-1">Leads ghosted/mo</p>
                    <p className="text-[10px] text-zinc-600">({proposal.ghosted_pct}% of {inputs.monthly_leads})</p>
                  </div>
                  <div className="bg-zinc-800/60 border border-white/[0.04] rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-amber-400 font-data">{fmt(proposal.monthly_revenue_at_risk)}</p>
                    <p className="text-xs text-zinc-500 mt-1">Revenue at risk/mo</p>
                    <p className="text-[10px] text-zinc-600">{fmt(inputs.avg_job_value)} avg job</p>
                  </div>
                  <div className="bg-zinc-800/60 border border-white/[0.04] rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-zinc-300 font-data">{fmt(proposal.sam_cost)}</p>
                    <p className="text-xs text-zinc-500 mt-1">Sam AI/mo</p>
                    <p className="text-[10px] text-zinc-600">All-in cost</p>
                  </div>
                </div>
              </div>

              {/* ROI Banner */}
              <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-4 flex items-center gap-4">
                <div className="text-4xl font-black text-orange-400 font-data">{proposal.roi_multiple}</div>
                <div>
                  <p className="text-sm font-semibold text-zinc-200">Return on Investment</p>
                  <p className="text-xs text-zinc-400">
                    Every {fmt(proposal.sam_cost)} invested recovers up to {fmt(proposal.monthly_revenue_at_risk)} in ghosted leads
                  </p>
                </div>
              </div>

              {/* Pitch */}
              <div>
                <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Why Sam AI</p>
                <p className="text-sm text-zinc-300 leading-relaxed">{proposal.pitch}</p>
              </div>

              {/* Proof Points */}
              {proposal.proof_points.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">What You Get</p>
                  <div className="space-y-2">
                    {proposal.proof_points.map((point, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <ChevronRight className="w-3.5 h-3.5 text-orange-400 mt-0.5 flex-shrink-0" />
                        <p className="text-sm text-zinc-300">{point}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Guarantee */}
              <div className="bg-orange-500 rounded-xl p-4">
                <p className="text-xs font-semibold text-orange-100 uppercase tracking-wider mb-1">Our Guarantee</p>
                <p className="text-sm font-semibold text-white">If Sam doesn't book you 5 qualified quotes this month, you don't pay.</p>
              </div>

              {/* CTA */}
              <div className="text-center pt-1">
                <p className="text-sm text-zinc-400 italic">{proposal.cta}</p>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function SamDemo() {
  const [tab, setTab] = useState<'sms' | 'proposal'>('sms');

  return (
    <div className="flex flex-col h-full p-5 gap-4 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-lg font-semibold text-zinc-100 flex items-center gap-2">
            <Bot className="w-5 h-5 text-orange-400" />
            Sam AI Demo
          </h1>
          <p className="text-xs text-zinc-500 mt-0.5">Live SMS simulator + personalized proposal generator</p>
        </div>

        {/* Tab switcher */}
        <div className="flex bg-zinc-900 border border-white/[0.06] rounded-lg p-0.5">
          <button
            onClick={() => setTab('sms')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-sm font-medium transition-colors ${
              tab === 'sms'
                ? 'bg-orange-500/10 text-orange-400 shadow-[inset_0_0_0_1px_rgba(249,115,22,0.15)]'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            SMS Simulator
          </button>
          <button
            onClick={() => setTab('proposal')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-sm font-medium transition-colors ${
              tab === 'proposal'
                ? 'bg-orange-500/10 text-orange-400 shadow-[inset_0_0_0_1px_rgba(249,115,22,0.15)]'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            Proposal Generator
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0">
        {tab === 'sms' ? <SmsSimulator /> : <ProposalGenerator />}
      </div>
    </div>
  );
}
