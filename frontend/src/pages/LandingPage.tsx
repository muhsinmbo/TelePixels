import React, { useEffect, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { cn } from '../lib/utils';
import BrandLogo from '../components/BrandLogo';
import {
  Activity,
  ArrowRight,
  BadgeCheck,
  Brain,
  CheckCircle,
  FileText,
  Globe,
  MessageCircle,
  ShieldCheck,
  Stethoscope,
  Users,
  Workflow,
} from 'lucide-react';
import { Stagger, StaggerItem, Reveal } from '../components/ScrollReveal';

const NAV_LINKS = [
  { label: 'Overview', id: 'overview' },
  { label: 'Problem', id: 'problem' },
  { label: 'Workflow', id: 'workflow' },
  { label: 'Features', id: 'features' },
  { label: 'AI', id: 'ai' },
  { label: 'Trust', id: 'trust' },
];

const PROBLEM_CARDS = [
  { title: 'Delayed reports', value: '24–72 hours', desc: 'Frontline doctors in Ghana described report turnaround times ranging from 24–48 hours to as long as 72 hours in some facilities.' },
  { title: 'Workforce gap', value: '~3 per million', desc: 'A Ghanaian study identified approximately 3 radiologists per million people, with major regional disparities in specialist distribution.' },
  { title: 'Regional inequality', value: 'No identified radiologists', desc: 'Several regions had no identified radiologists at the time of the study, limiting specialist access in underserved areas.' },
  { title: 'Fragmented care', value: 'Study to report', desc: 'The imaging journey often breaks down between facility, clinician, specialist and patient access at the point of report delivery.' },
];

const WORKFLOW = [
  { title: 'Capture', desc: 'The patient completes an imaging examination at a participating facility.' },
  { title: 'Upload', desc: 'The study and relevant clinical information are organized within TelePixels.' },
  { title: 'Connect', desc: 'The study can be routed into the appropriate reporting workflow.' },
  { title: 'Review', desc: 'A radiologist, sonographer or authorized professional reviews the examination.' },
  { title: 'AI assistance', desc: 'Where enabled, the context-aware AI assistant helps structure or refine the report.' },
  { title: 'Finalize', desc: 'The healthcare professional reviews, edits and finalizes the report.' },
  { title: 'Access', desc: 'The patient can access the authorized finalized report digitally.' },
];

const SOLUTION = [
  { icon: Users, title: 'For imaging facilities', desc: 'Manage patients, imaging requests, studies and reporting workflows digitally.' },
  { icon: FileText, title: 'For radiologists', desc: 'Access assigned studies remotely and work through a structured reporting workflow.' },
  { icon: Stethoscope, title: 'For sonographers', desc: 'Create and manage ultrasound reports through a dedicated workflow.' },
  { icon: Activity, title: 'For patients', desc: 'Access authorized imaging information and finalized reports through a patient-facing experience.' },
];

const FEATURES = [
  { icon: FileText, title: 'Digital Imaging Workflow', desc: 'Manage patients, imaging requests, studies and reports in one connected platform.' },
  { icon: Globe, title: 'Remote Reporting', desc: 'Support radiologists and specialists who may not be physically located at the imaging facility.' },
  { icon: Activity, title: 'Web-Based Viewer', desc: 'Review imaging studies through a browser-based interface designed for streamlined clinical review.' },
  { icon: CheckCircle, title: 'Structured Reporting', desc: 'Create consistent, organized reports through dedicated reporting workflows.' },
  { icon: Users, title: 'Patient Access', desc: 'Give patients a digital pathway to authorized imaging results and reports.' },
  { icon: BadgeCheck, title: 'QR Access', desc: 'Create convenient QR-based pathways to authorized information.' },
  { icon: Brain, title: 'Context-Aware AI', desc: 'Use relevant patient and study context to assist with appropriate report preparation and language.' },
  { icon: ShieldCheck, title: 'Human Review', desc: 'Keep the qualified imaging professional in control of the final report.' },
  { icon: MessageCircle, title: 'Automated Notifications', desc: 'Deliver finalized reports to patients and referring physicians via WhatsApp and email with configurable templates.' },
];

const AI_ITEMS = [
  { icon: Brain, title: 'Context-aware assistance', desc: 'Relevant study context helps prepare an appropriate reporting structure without overriding the current examination.' },
  { icon: ShieldCheck, title: 'Human review remains central', desc: 'The qualified imaging professional stays responsible for the final report and clinical judgment.' },
  { icon: CheckCircle, title: 'Model-agnostic positioning', desc: 'The underlying AI provider can be selected by the development team without making the product identity dependent on one company.' },
];

const TRUST_ITEMS = [
  { icon: ShieldCheck, title: 'Human review', desc: 'AI-generated content remains subject to review by an appropriately qualified professional.' },
  { icon: FileText, title: 'Controlled context', desc: 'AI should receive only the information required for the task through controlled application interfaces.' },
  { icon: Users, title: 'Privacy', desc: 'Patient information should be protected through appropriate access controls and security practices.' },
  { icon: Activity, title: 'Transparency', desc: 'AI-assisted content should be identifiable to the reviewing professional.' },
  { icon: BadgeCheck, title: 'Accountability', desc: 'The final report remains under the responsibility of the authorized healthcare professional.' },
];

const TECH = ['Digital workflow', 'Remote reporting', 'Patient access', 'AI-assisted reporting', 'DICOM-ready', 'Human review'];

const LandingPage: React.FC = () => {
  const [scrolled, setScrolled] = useState(false);
  const [progress, setProgress] = useState(0);
  const [activeSection, setActiveSection] = useState('overview');
  const reduce = useReducedMotion();

  useEffect(() => {
    const onScroll = () => {
      const offset = window.scrollY;
      const docHeight = document.body.scrollHeight - window.innerHeight;
      setProgress(docHeight ? (offset / docHeight) * 100 : 0);
      setScrolled(offset > 30);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const sectionIds = useMemo(() => NAV_LINKS.map((link) => link.id), []);

  useEffect(() => {
    const sections = sectionIds
      .map((id) => ({ id, el: document.getElementById(id) }))
      .filter((entry): entry is { id: string; el: HTMLElement } => Boolean(entry.el));

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.boundingClientRect.top - a.boundingClientRect.top)[0];
        if (visible) setActiveSection(visible.target.id);
      },
      { rootMargin: '-25% 0px -35% 0px', threshold: 0.05 }
    );

    sections.forEach(({ el }) => observer.observe(el));
    return () => observer.disconnect();
  }, [sectionIds]);

  const scrollTo = (id: string) => {
    const node = document.getElementById(id);
    if (node) node.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-white text-slate-900 antialiased selection:bg-primary/20 selection:text-white">
      <style>{`
        html { scroll-behavior: smooth; }
        .hero-grid {
          background-image:
            linear-gradient(rgba(148,163,184,0.08) 1px, transparent 1px),
            linear-gradient(90deg, rgba(148,163,184,0.08) 1px, transparent 1px);
          background-size: 26px 26px;
        }
        @media (prefers-reduced-motion: no-preference) {
          .glow-amber { box-shadow: 0 0 12px 2px rgba(251,146,60,0.25); }
          .glow-cyan { box-shadow: 0 0 12px 2px rgba(6,182,219,0.2); }
          .glow-emerald { box-shadow: 0 0 12px 2px rgba(34,197,94,0.2); }
          .glow-violet { box-shadow: 0 0 12px 2px rgba(167,139,251,0.2); }
          .glow-rose { box-shadow: 0 0 12px 2px rgba(251,113,133,0.25); }
        }
      `}</style>

      {/* Scroll progress */}
      <div className="fixed left-0 right-0 top-0 z-[100] h-0.5 bg-slate-200">
        <motion.div
          className="h-full w-0 bg-gradient-to-r from-cyan-500 via-primary to-emerald-500"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Header */}
      <header
        style={{ '--text-main': '#000000', '--text-muted': '#423714', '--color-main': '#000000', '--color-primary': '#000000', '--primary': '#000000', '--primary-rgb': '0,0,0' } as React.CSSProperties}
        className={cn(
          'fixed left-0 right-0 top-0 z-50 text-black transition-all duration-300',
          scrolled ? 'border-b border-slate-200 bg-white/90 py-3 backdrop-blur-md' : 'py-5'
        )}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 lg:px-8">
          <BrandLogo type="full" className="h-9" />
          <nav className="hidden items-center gap-7 text-sm text-black md:flex">
            {NAV_LINKS.map((item) => (
              <button
                key={item.id}
                onClick={() => scrollTo(item.id)}
                className={cn(
                  'relative font-medium transition-colors duration-200',
                  activeSection === item.id ? 'text-black' : 'hover:text-slate-800'
                )}
              >
                {item.label}
                <span
                  className={cn(
                    'absolute -bottom-2 left-0 h-0.5 w-full rounded-full bg-primary transition-opacity duration-200',
                    activeSection === item.id ? 'opacity-100' : 'opacity-0'
                  )}
                />
              </button>
            ))}
          </nav>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => (window.location.href = '/login')}
            className="border border-slate-200 bg-amber-400 px-5 py-2.5 text-sm font-bold text-black shadow-md hover:bg-amber-300"
          >
            Explore TelePixels
          </motion.button>
        </div>
      </header>

      <main id="main">
        {/* Overview / Hero */}
        <section id="overview" className="relative bg-white pt-32 pb-16 md:pt-36 md:pb-24">
          <div className="absolute inset-0 hero-grid opacity-40" />
          <div className="absolute left-1/2 top-28 h-80 w-80 -translate-x-1/2 rounded-full bg-amber-100 blur-3xl" />
          <div className="absolute right-10 top-20 h-64 w-64 rounded-full bg-cyan-100 blur-3xl" />

          <div className="relative z-10 mx-auto grid max-w-7xl items-center gap-12 px-6 lg:grid-cols-[1.05fr_0.95fr] lg:px-8">
            <div>
              <Reveal delay={0.08} y={20}>
                <span className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.28em] text-amber-800">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                  Patient-centered imaging
                </span>
              </Reveal>

              <Reveal delay={0.14} y={28}>
                <h1 className="mt-6 max-w-xl text-4xl font-black tracking-[-0.06em] text-slate-900 sm:text-5xl lg:text-6xl">
                  Medical Imaging, Connected.
                </h1>
              </Reveal>

              <Reveal delay={0.2} y={18}>
                <p className="mt-6 max-w-xl text-lg leading-8 text-slate-600">
                  TelePixels is a patient-centered medical imaging platform designed to simplify imaging workflows, enable remote reporting and give patients easier access to their finalized imaging information.
                </p>
              </Reveal>

              <Reveal delay={0.28} y={16}>
                <div className="mt-8 flex flex-wrap gap-4">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => (window.location.href = '/login')}
                    className="border border-slate-200 bg-amber-400 px-5 py-2.5 text-sm font-bold text-black shadow-md hover:bg-amber-300"
                  >
                    See how it works
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => scrollTo('features')}
                    className="border border-cyan-200 bg-cyan-50 px-5 py-2.5 text-sm font-semibold text-cyan-800 hover:border-cyan-300 hover:bg-cyan-100"
                  >
                    Explore features
                  </motion.button>
                </div>
              </Reveal>

              <Reveal delay={0.34} y={12}>
                <div className="mt-10 rounded-2xl border border-amber-200 bg-amber-50/50 p-4 max-w-lg">
                  <p className="text-sm leading-7 text-slate-600">
                    <span className="font-medium text-slate-900">Core idea:</span> get the right imaging information to the right healthcare professional at the right time — and make the resulting information easier for the patient to access.
                  </p>
                </div>
              </Reveal>
            </div>

          </div>
        </section>

        {/* Problem — Gold/Ash */}
        <section id="problem" className="relative bg-[#faf7f0] py-20 md:py-28">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(150,126,43,0.05),transparent_60%)]" />
          <div className="mx-auto max-w-7xl px-6 lg:px-8">
            <Reveal>
              <div className="max-w-3xl">
                <p className="text-[10px] uppercase tracking-[0.28em] text-cyan-700">The problem</p>
                <h2 className="mt-4 text-3xl font-bold tracking-[-0.04em] text-slate-900 md:text-4xl">
                  Imaging shouldn't stop at the scan.
                </h2>
                <p className="mt-5 text-base leading-8 text-slate-600">
                  A patient can complete an imaging examination and still face another challenge: getting the right information to the right healthcare professional and receiving the final report without unnecessary delays.
                </p>
              </div>
            </Reveal>

    <Stagger className="mt-12 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
              {PROBLEM_CARDS.map((card, index) => (
                <StaggerItem key={card.title} delay={index * 0.06}>
                  <motion.div
                    whileHover={!reduce ? { y: -5, boxShadow: '0 8px 25px rgba(150,126,43,0.15)' } : {}}
                    className="group h-full rounded-[1.75rem] border border-amber-200 bg-white p-5 shadow-sm transition-colors"
                  >
                    <p className="text-[10px] uppercase tracking-[0.2em] text-amber-700">{card.title}</p>
                    <p className="mt-4 text-2xl font-black tracking-[-0.05em] text-amber-700">{card.value}</p>
                    <p className="mt-4 text-sm leading-6 text-slate-600">{card.desc}</p>
                  </motion.div>
                </StaggerItem>
              ))}
            </Stagger>

            <Reveal delay={0.06} y={16}>
              <div className="mt-12 rounded-[2rem] border border-amber-200 bg-amber-50/50 p-6 md:p-8">
                <p className="text-base leading-8 text-slate-600">
                  In Ghana, research has documented challenges including radiologist shortages, delayed access to radiology reports and uneven geographic distribution of specialist expertise.
                  <span className="mt-3 block text-slate-900">
                    TelePixels is designed to connect the imaging journey—from study to specialist reporting to patient access.
                  </span>
                </p>
              </div>
            </Reveal>
          </div>
        </section>

        {/* Workflow — Black */}
        <section id="workflow" className="relative bg-[#0f172a] py-20 md:py-28">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,_rgba(34,197,94,0.08),transparent_60%)]" />
          <div className="mx-auto max-w-7xl px-6 lg:px-8">
            <Reveal>
              <div className="max-w-3xl">
                <p className="text-[10px] uppercase tracking-[0.28em] text-emerald-400">How it works</p>
                <h2 className="mt-4 text-3xl font-bold tracking-[-0.04em] text-white md:text-4xl">
                  One connected imaging workflow.
                </h2>
              </div>
            </Reveal>

            <Stagger className="mt-12 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {WORKFLOW.map((step, index) => (
                <StaggerItem key={step.title} delay={index * 0.05}>
                  <motion.div
                    whileHover={!reduce ? { y: -5, boxShadow: '0 0 22px 4px rgba(34,197,94,0.25)' } : {}}
                    className="group h-full rounded-[1.8rem] border border-emerald-900/40 bg-[#1e293b] p-5"
                  >
                    <div className="mb-5 flex items-center justify-between">
                      <div className="flex h-11 w-11 items-center justify-center rounded-full border border-emerald-900/40 bg-emerald-900/20 text-sm font-bold text-emerald-400">
                           {index + 1}
                      </div>
                      <Workflow className="h-5 w-5 text-slate-500 group-hover:text-emerald-400 transition-colors" />
                    </div>
                    <h3 className="text-lg font-semibold text-white group-hover:text-emerald-300 transition-colors">{step.title}</h3>
                    <p className="mt-3 text-sm leading-6 text-slate-400">{step.desc}</p>
                  </motion.div>
                </StaggerItem>
              ))}
            </Stagger>
          </div>
        </section>

        {/* Who it is for */}
        <section className="relative bg-white py-20 md:py-28">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(167,139,251,0.03),transparent_60%)]" />
          <div className="mx-auto max-w-7xl px-6 lg:px-8">
            <Reveal>
              <div className="max-w-3xl">
                <p className="text-[10px] uppercase tracking-[0.28em] text-violet-700">Who it is for</p>
                <h2 className="mt-4 text-3xl font-bold tracking-[-0.04em] text-slate-900 md:text-4xl">
                  The people and information around the image, connected.
                </h2>
              </div>
            </Reveal>

             <Stagger className="mt-12 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
               {SOLUTION.map((item, index) => (
                 <StaggerItem key={item.title} delay={index * 0.06}>
                   <motion.div
                     variants={{
                       float: {
                         y: [0, -6, 0],
                         transition: {
                           duration: 4 + index * 0.8,
                           repeat: Infinity,
                           repeatType: 'reverse',
                           ease: 'easeInOut',
                           delay: index * 0.4,
                         },
                       },
                       hover: {
                         y: -8,
                         scale: 1.02,
                         boxShadow: '0 12px 32px rgba(167,139,251,0.15)',
                         transition: {
                           type: 'spring',
                           stiffness: 400,
                           damping: 25,
                         },
                       },
                     }}
                     initial="float"
                     animate="float"
                     whileHover={!reduce ? 'hover' : undefined}
                     className="group relative h-full cursor-default rounded-[1.75rem] border border-violet-200 bg-white p-5 shadow-sm transition-colors"
                   >
                     <div className="absolute inset-0 rounded-[1.75rem] opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                       <motion.div
                         animate={
                           !reduce
                             ? { rotate: [0, 5, -5, 0] }
                             : {}
                         }
                         transition={{
                           duration: 3,
                           repeat: Infinity,
                           repeatType: 'reverse',
                           ease: 'easeInOut',
                           delay: index * 0.3,
                         }}
                         className="absolute -top-2 -right-2 h-1 w-8 rounded-full bg-gradient-to-r from-violet-300 to-transparent opacity-40"
                       />
                     </div>

                     <div className="relative flex h-12 w-12 items-center justify-center rounded-full border border-violet-200 bg-violet-50 text-violet-700 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3">
                       <item.icon className="h-5 w-5 transition-transform duration-300 group-hover:scale-110" />
                     </div>
                     <h3 className="mt-5 text-lg font-semibold text-slate-900 group-hover:text-violet-800 transition-colors">{item.title}</h3>
                     <p className="mt-3 text-sm leading-6 text-slate-600">{item.desc}</p>
                   </motion.div>
                 </StaggerItem>
               ))}
             </Stagger>
          </div>
        </section>

        {/* Features — Black */}
        <section id="features" className="relative bg-[#0f172a] py-20 md:py-28">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,_rgba(167,139,251,0.08),transparent_55%)]" />
          <div className="mx-auto max-w-7xl px-6 lg:px-8">
            <Reveal>
              <div className="max-w-3xl">
                <p className="text-[10px] uppercase tracking-[0.28em] text-violet-400">What TelePixels provides</p>
                <h2 className="mt-4 text-3xl font-bold tracking-[-0.04em] text-white md:text-4xl">
                  The platform, connected.
                </h2>
                <p className="mt-5 text-base leading-8 text-slate-400">
                  Everything a modern teleradiology practice needs, connected and contextual.
                </p>
              </div>
            </Reveal>

            <Stagger className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {FEATURES.map((item, index) => (
                <StaggerItem key={item.title} delay={index * 0.05}>
                  <motion.div
                    whileHover={!reduce ? { y: -6, boxShadow: '0 0 24px 6px rgba(167,139,251,0.25)' } : {}}
                    className="group h-full rounded-[1.75rem] border border-violet-900/40 bg-[#1e293b] p-5"
                  >
                     <div className="flex h-12 w-12 items-center justify-center rounded-full border border-violet-900/40 bg-violet-900/20 text-violet-400">
                       <item.icon className="h-6 w-6" />
                     </div>
                    <h3 className="mt-5 text-lg font-semibold text-white group-hover:text-violet-300 transition-colors">{item.title}</h3>
                    <p className="mt-3 text-sm leading-6 text-slate-400">{item.desc}</p>
                  </motion.div>
                </StaggerItem>
              ))}
            </Stagger>
          </div>
        </section>

        {/* AI — Gold/Ash */}
        <section id="ai" className="relative bg-[#faf7f0] py-20 md:py-28">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(150,126,43,0.05),transparent_60%)]" />
          <div className="mx-auto max-w-3xl px-6 lg:px-8">
            <Reveal>
              <div>
                <p className="text-[10px] uppercase tracking-[0.28em] text-amber-700">AI-assisted reporting</p>
                <h2 className="mt-4 text-3xl font-bold tracking-[-0.04em] text-slate-900 md:text-4xl">
                  Context-aware AI support for clinical reporting.
                </h2>
                <p className="mt-5 max-w-xl text-base leading-7 text-slate-600">
                  TelePixels is also being designed to support an AI-assisted reporting workflow. The AI can assist the clinician with the reporting process by using controlled, relevant study context such as age, sex, examination type, modality, body region, study date and clinical history.
                </p>

                <div className="mt-8 space-y-5">
                  {AI_ITEMS.map((item, index) => (
                    <StaggerItem key={item.title} delay={index * 0.06}>
                      <motion.div
                        whileHover={!reduce ? { x: 4, boxShadow: '0 8px 25px rgba(150,126,43,0.12)' } : {}}
                        className="group flex gap-4 rounded-2xl border border-amber-200 bg-white p-4 shadow-sm"
                      >
                         <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-amber-200 bg-amber-50 text-amber-700">
                           <item.icon className="h-5 w-5" />
                         </div>
                        <div>
                          <h3 className="text-base font-semibold text-slate-900 group-hover:text-amber-800 transition-colors">{item.title}</h3>
                          <p className="mt-1 text-sm leading-6 text-slate-600">{item.desc}</p>
                        </div>
                      </motion.div>
                    </StaggerItem>
                  ))}
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* Trust — Black */}
        <section id="trust" className="relative bg-[#0f172a] py-20 md:py-28">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,_rgba(251,113,133,0.08),transparent_60%)]" />
          <div className="mx-auto max-w-7xl px-6 lg:px-8">
            <Reveal>
              <div className="max-w-3xl">
                <p className="text-[10px] uppercase tracking-[0.28em] text-rose-400">Trust and safety</p>
                <h2 className="mt-4 text-3xl font-bold tracking-[-0.04em] text-white md:text-4xl">
                  Built around clinical oversight.
                </h2>
              </div>
            </Reveal>

            <Stagger className="mt-12 grid gap-5 md:grid-cols-2 xl:grid-cols-5">
              {TRUST_ITEMS.map((item, index) => (
                <StaggerItem key={item.title} delay={index * 0.06}>
                  <motion.div
                    whileHover={!reduce ? { y: -5, boxShadow: '0 0 22px 4px rgba(251,113,133,0.25)' } : {}}
                    className="group h-full rounded-[1.75rem] border border-rose-900/40 bg-[#1e293b] p-5"
                  >
                     <div className="flex h-11 w-11 items-center justify-center rounded-full border border-rose-900/40 bg-rose-900/20 text-rose-400">
                       <item.icon className="h-5 w-5" />
                     </div>
                    <h3 className="mt-5 text-base font-semibold text-white group-hover:text-rose-300 transition-colors">{item.title}</h3>
                    <p className="mt-3 text-sm leading-6 text-slate-400">{item.desc}</p>
                  </motion.div>
                </StaggerItem>
              ))}
            </Stagger>
          </div>
        </section>

        {/* Evidence CTA — Gold/Ash */}
        <section className="relative bg-[#faf7f0] pb-20 pt-12 md:pb-28">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(150,126,43,0.06),transparent_60%)]" />
          <div className="mx-auto max-w-7xl px-6 lg:px-8">
            <Reveal>
              <div className="mx-auto max-w-4xl">
                <div className="rounded-[2rem] border border-amber-300/40 bg-gradient-to-b from-amber-50 to-[#fdf6f0] p-8 text-center shadow-[0_25px_60px_rgba(150,126,43,0.08)] md:p-12">
                  <p className="text-[10px] uppercase tracking-[0.28em] text-amber-800">Evidence-based impact</p>
                  <h2 className="mx-auto mt-5 max-w-3xl text-3xl font-bold tracking-[-0.05em] text-slate-900 md:text-5xl">
                    Better-connected imaging services for a more accessible healthcare system.
                  </h2>
                  <p className="mx-auto mt-6 max-w-2xl text-base leading-7 text-slate-600">
                    TelePixels is positioned to help reduce unnecessary friction between imaging, reporting and patient access while being designed around the realities of the healthcare system.
                  </p>

                  <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center sm:gap-5">
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => scrollTo('features')}
                      className="w-full sm:w-auto rounded-xl border border-slate-200 bg-amber-400 px-7 py-3 text-sm font-bold text-black shadow-[0_4px_14px_rgba(251,146,60,0.25)] hover:bg-amber-300"
                    >
                      Explore features
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </motion.button>
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => scrollTo('workflow')}
                      className="w-full sm:w-auto rounded-xl border border-amber-300 bg-transparent px-7 py-3 text-sm font-semibold text-amber-800 hover:bg-amber-100"
                    >
                      How it works
                    </motion.button>
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-12">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="grid grid-cols-2 gap-8 md:grid-cols-3 md:gap-12">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Product</h3>
              <div className="mt-3 flex flex-col gap-2.5 text-sm">
                {['Features', 'Workflow', 'AI assistance', 'Pricing'].map((item) => (
                  <button
                    key={item}
                    onClick={() => item === 'Features' ? scrollTo('features') : item === 'Workflow' ? scrollTo('workflow') : item === 'AI assistance' ? scrollTo('ai') : undefined}
                    className="text-left text-slate-600 transition-colors hover:text-slate-900"
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Company</h3>
              <div className="mt-3 flex flex-col gap-2.5 text-sm">
                {['About', 'Careers', 'Blog', 'Contact'].map((item) => (
                  <a key={item} href="#" className="text-left text-slate-600 transition-colors hover:text-slate-900">
                    {item}
                  </a>
                ))}
              </div>
            </div>
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Legal</h3>
              <div className="mt-3 flex flex-col gap-2.5 text-sm">
                {['Privacy', 'Terms', 'Security', 'DICOM compliance'].map((item) => (
                  <a key={item} href="#" className="text-left text-slate-600 transition-colors hover:text-slate-900">
                    {item}
                  </a>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-12 border-t border-slate-200 pt-6">
            <p className="text-center text-xs text-slate-500">
              © {new Date().getFullYear()} TelePixels. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
