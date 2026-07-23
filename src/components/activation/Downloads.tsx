import { FileText, ClipboardCheck, MapPin, Shield, Users, Download } from 'lucide-react';
import { DOWNLOAD_FILES } from '../../lib/onboarding/data';
import { SectionLabel, Eyebrow, H2 } from './primitives';

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  FileText,
  ClipboardCheck,
  MapPin,
  Shield,
  Users,
};

export default function Downloads() {
  return (
    <section id="downloads" className="py-24 md:py-32 px-6 bg-fym-cream2/40">
      <div className="max-w-7xl mx-auto">
        <SectionLabel n="09" label="Resource Library" />

        <div className="grid lg:grid-cols-12 gap-10 mb-16">
          <div className="lg:col-span-7">
            <Eyebrow>Downloads</Eyebrow>
            <H2 className="mt-3">Everything in one place.</H2>
            <p className="text-fym-muted mt-6 leading-[1.6] max-w-xl">
              Playbook, scripts, checklists, and the recruitment deck. Hand-pick what your agents need.
            </p>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {DOWNLOAD_FILES.map((f) => {
            const Icon = ICONS[f.icon] || FileText;
            return (
              <a
                key={f.name}
                href={f.href}
                download
                className="group bg-white border border-fym-ink/10 rounded-xl p-6 hover:border-fym-brass/30 hover:-translate-y-0.5 transition-all flex flex-col"
              >
                <div className="flex items-start justify-between mb-6">
                  <div className="w-10 h-10 rounded-lg bg-fym-cream2 flex items-center justify-center">
                    <Icon className="w-4 h-4 text-fym-ink" />
                  </div>
                  <Download className="w-4 h-4 text-fym-muted/40 group-hover:text-fym-brass transition-colors" />
                </div>
                <div className="text-lg text-fym-ink tracking-tight leading-snug font-semibold">{f.name}</div>
                <p className="text-[13px] text-fym-muted leading-relaxed mt-2">{f.desc}</p>
              </a>
            );
          })}
        </div>
      </div>
    </section>
  );
}
