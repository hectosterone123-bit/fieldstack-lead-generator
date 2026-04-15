import { useState } from 'react';
import { BookOpen } from 'lucide-react';
import { cn } from '../lib/utils';

type Tab = 'opening' | 'discovery' | 'pitch' | 'objections' | 'close';

export function ProspectingScript() {
  const [activeTab, setActiveTab] = useState<Tab>('opening');

  const tabs: { id: Tab; label: string }[] = [
    { id: 'opening', label: 'Opening' },
    { id: 'discovery', label: 'Discovery' },
    { id: 'pitch', label: 'Pitch' },
    { id: 'objections', label: 'Objections' },
    { id: 'close', label: 'Close' },
  ];

  const KeyStat = ({ value, label }: { value: string; label: string }) => (
    <div className="px-4 py-3 rounded-lg bg-zinc-900 border border-white/[0.06]">
      <p className="text-sm font-bold text-orange-400">{value}</p>
      <p className="text-xs text-zinc-500 leading-tight">{label}</p>
    </div>
  );

  const Callout = ({ type = 'key', children }: { type?: 'key' | 'stat' | 'note'; children: React.ReactNode }) => {
    const bgColor = type === 'key' ? 'bg-orange-500/[0.08]' : type === 'stat' ? 'bg-emerald-500/[0.08]' : 'bg-violet-500/[0.08]';
    const borderColor = type === 'key' ? 'border-orange-500/20' : type === 'stat' ? 'border-emerald-500/20' : 'border-violet-500/20';
    const textColor = type === 'key' ? 'text-orange-100' : type === 'stat' ? 'text-emerald-100' : 'text-violet-100';

    return (
      <div className={cn('p-4 rounded-lg', bgColor, 'border', borderColor)}>
        <p className={cn('text-sm font-medium leading-relaxed', textColor)}>{children}</p>
      </div>
    );
  };

  const ScriptBlock = ({ label, text }: { label: string; text: string }) => (
    <div className="mb-6">
      <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-2">{label}</p>
      <div className="bg-zinc-950 rounded-lg border border-white/[0.04] p-4 overflow-x-auto">
        <pre className="text-sm text-zinc-200 whitespace-pre-wrap font-sans leading-relaxed">{text}</pre>
      </div>
    </div>
  );

  const renderContent = () => {
    switch (activeTab) {
      case 'opening':
        return (
          <div className="space-y-5">
            <ScriptBlock
              label="The Hook"
              text={`"Hi [Name], I'm [Your Name] with FieldStack. I'm calling because we work with
[HVAC/Plumbing/Roofing] contractors, and I noticed something that costs most
of them 3–5 jobs a month: leads going unanswered because they're on job sites.
Does that happen to you?"`}
            />
            <Callout type="key">
              <strong>Why this works:</strong> Specific problem (not vague sales pitch), quantified loss ($15K–25K/mo), respects their pain, ends with a question (keeps them talking)
            </Callout>
            <div className="grid grid-cols-2 gap-3">
              <KeyStat value="78%" label="of customers hire first responder" />
              <KeyStat value="21x" label="more effective in 5 min vs 30 min" />
            </div>
          </div>
        );

      case 'discovery':
        return (
          <div className="space-y-6">
            <p className="text-sm text-zinc-400">
              Ask these questions in order. Listen for the gap between their response time and 5 minutes.
            </p>

            {[
              {
                q: '"When someone calls in or fills out your website, how long until someone from your team calls them back?"',
                listen: 'If they say 30+ min: "That\'s the problem. Whoever responds first gets the job."',
              },
              {
                q: '"What percentage of the leads you quote would you say just ghost?"',
                listen: 'If they say 40–60%: "That\'s $10K–$15K/month in lost revenue."',
              },
              {
                q: '"Right now, when you\'re on a job and a lead calls, what actually happens?"',
                listen: 'They know: homeowner calls your competitor instead.',
              },
              {
                q: '"When you quote a job, how many times do you follow up if they go silent?"',
                listen: 'Most admit 0–1. They should do 5–7.',
              },
              {
                q: '"How many leads do you get per month from all sources?"',
                listen: 'Sets context for scale of problem.',
              },
            ].map((item, i) => (
              <div key={i} className="space-y-2">
                <p className="text-sm font-medium text-zinc-100">{item.q}</p>
                <Callout type="note">{item.listen}</Callout>
              </div>
            ))}
          </div>
        );

      case 'pitch':
        return (
          <div className="space-y-5">
            <ScriptBlock
              label="Solution Pitch"
              text={`"Here's what we do: when a lead calls and you're busy, our system texts them
back within 30 seconds from your number—qualifying them and booking a callback.
By the time you finish the job, the lead is already warm and scheduled. Most
contractors see 3–5 extra jobs a month from this alone."`}
            />

            <ScriptBlock
              label="ROI Reframe (After Any Hesitation)"
              text={`"At $5,000 per job, even if this lands you just 2 extra jobs a month, you're
breaking even in the first month. After that, you're making money every month.
That's the math."`}
            />

            <Callout type="stat">
              <strong>Key stat to anchor:</strong> Responding within 5 minutes is 21x more effective than 30 minutes. You don't need to be faster in general—you just need to be first.
            </Callout>

            <div className="grid grid-cols-2 gap-3">
              <KeyStat value="$5,000–$15K" label="average job value" />
              <KeyStat value="3–5" label="extra jobs/mo typical" />
            </div>
          </div>
        );

      case 'objections':
        return (
          <div className="space-y-6">
            {[
              {
                obj: '"I don\'t have time right now"',
                response: `"I totally get it—you're on a job. That's exactly why I'm calling. How about
I send you a 5-minute video tonight? Watch it with a coffee, and Thursday we
do a quick 15-minute call. Deal?"`,
              },
              {
                obj: '"It\'s too expensive"',
                response: `"Fair question. Let me ask: if this landed you just one extra job per month—
and most contractors see 3–5—you're breaking even in the first month and making
money every month after. What's your concern: that it won't work, or budget?"`,
              },
              {
                obj: '"I already use Jobber/ServiceTitan"',
                response: `"Got it—those are CRM systems. We're not a replacement. We're what you put in
front to make sure you actually get the lead before it goes cold. Those tools
organize leads; we prevent leads from ghosting. How's your response time on
incoming calls right now?"`,
              },
              {
                obj: '"I need to think about it"',
                response: `"Totally fair. Let me ask: what does 'think about it' mean? Are you unsure about
whether this solves your problem, or unsure about budget? Those are two different
conversations."`,
              },
              {
                obj: '"We\'re not losing leads"',
                response: `"That's great if you've got it dialed in. Most contractors lose 15–25% to ghosting
or slow response. Are you tracking response time to first contact? From the moment
they call to when you actually call them back?"`,
              },
            ].map((item, i) => (
              <div key={i} className="space-y-2">
                <p className="text-sm font-semibold text-orange-400 italic">{item.obj}</p>
                <ScriptBlock label={`Response:`} text={item.response} />
              </div>
            ))}
          </div>
        );

      case 'close':
        return (
          <div className="space-y-6">
            <ScriptBlock
              label="The Close (After Handling Objections)"
              text={`"Alright, I think this could genuinely work for you. Let me send you a quick
5-minute video showing how this works with contractors like you. You watch it
tonight, Thursday we jump on a 15-minute call to answer questions. After that
call, you'll know if it's a fit. Sound fair?"`}
            />

            <ScriptBlock
              label="Confirm & Get Commitment"
              text={`"Can I get your email for the video? And Thursday at 2—is that AM or PM?"`}
            />

            <Callout type="key">
              <strong>Critical:</strong> Specific time slot beats vague "when are you free?" by 58%. Always confirm date + time before hanging up.
            </Callout>

            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-zinc-100">After the Call:</h4>

              <div>
                <p className="text-xs text-zinc-500 uppercase tracking-wide mb-2">If Yes to Demo</p>
                <Callout type="stat">
                  Send video link within 30 minutes. Confirm call time via text 24 hours before. Have contractor case studies ready.
                </Callout>
              </div>

              <div>
                <p className="text-xs text-zinc-500 uppercase tracking-wide mb-2">If "Think About It"</p>
                <Callout type="note">
                  Send video anyway (without being pushy). Follow up in 2 days with: "Did you get a chance to watch? Any questions?" One more follow-up a week later. If still no, move on.
                </Callout>
              </div>

              <div>
                <p className="text-xs text-zinc-500 uppercase tracking-wide mb-2">If No</p>
                <Callout type="note">
                  Thank them and respect their time. Leave door open: "If things change, here's my info. No pressure." Don't be needy.
                </Callout>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <BookOpen className="w-6 h-6 text-orange-400" />
          <h1 className="text-2xl font-bold text-white">Prospecting Script</h1>
        </div>
        <p className="text-sm text-zinc-500">Your complete B2B sales script for cold calling home service contractors</p>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-4 gap-3">
        <KeyStat value="78%" label="hire first responder" />
        <KeyStat value="21x" label="more effective in 5 min" />
        <KeyStat value="$5K–$15K" label="average job value" />
        <KeyStat value="3–5" label="extra jobs per month" />
      </div>

      {/* Tab Strip */}
      <div className="flex gap-1 border-b border-white/[0.04] overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors duration-150',
              activeTab === tab.id
                ? 'border-orange-500 text-orange-400'
                : 'border-transparent text-zinc-500 hover:text-zinc-300'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content Card */}
      <div className="bg-zinc-900 rounded-xl border border-white/[0.06] p-6 min-h-96">{renderContent()}</div>

      {/* Footer Tip */}
      <div className="p-4 rounded-lg bg-violet-500/[0.08] border border-violet-500/20">
        <p className="text-sm text-zinc-300">
          <span className="font-semibold text-violet-300">Pro tip:</span> Open this page on your second monitor or tablet while calling. Reference the script during objections, but don't read verbatim—adapt to the conversation.
        </p>
      </div>
    </div>
  );
}
