import React, { useState } from 'react';
import { Upload, Play, Users, Download, TrendingUp, LayoutDashboard, Menu, X } from 'lucide-react';

export type StepId = 'input' | 'execution' | 'results' | 'tracking' | 'export' | 'overview';

interface StepNavProps {
  currentStep: StepId;
  onStepChange: (step: StepId) => void;
  companiesCount: number;
  contactsCount: number;
  materialsCount: number;
  trackedCount?: number;
  isExecuting: boolean;
  onOverview: () => void;
  layout?: 'top' | 'sidebar';
}

export const StepNav: React.FC<StepNavProps> = ({
  currentStep,
  onStepChange,
  companiesCount,
  contactsCount,
  materialsCount,
  trackedCount = 0,
  isExecuting,
  onOverview,
  layout = 'top',
}) => {
  const [sidebarExpanded, setSidebarExpanded] = useState(() => typeof window === 'undefined' || window.innerWidth >= 768);
  const steps: { id: StepId; label: string; icon: React.FC<{ className?: string }>; badge?: string | number }[] = [
    {
      id: 'input',
      label: '1. Entrada & Perfil',
      icon: Upload,
      badge: companiesCount > 0 ? `${companiesCount} empresas` : undefined,
    },
    {
      id: 'execution',
      label: '2. Execução & Logs',
      icon: Play,
      badge: isExecuting ? 'Em andamento' : undefined,
    },
    {
      id: 'results',
      label: '3. Contatos & Materiais',
      icon: Users,
      badge: contactsCount > 0 ? `${contactsCount} contatos` : undefined,
    },
    {
      id: 'tracking',
      label: '4. Acompanhamento & CRM',
      icon: TrendingUp,
      badge: trackedCount > 0 ? `${trackedCount} acompanhados` : undefined,
    },
    {
      id: 'export',
      label: '5. Exportação',
      icon: Download,
      badge: materialsCount > 0 ? `${materialsCount} prontos` : undefined,
    },
    { id: 'overview', label: '6. Visão Geral', icon: LayoutDashboard, badge: undefined },
  ];

  return (
    <div className={layout === 'sidebar' ? `sticky top-28 sm:top-16 z-20 ${sidebarExpanded ? 'w-72' : 'w-14'} h-[calc(100vh-7rem)] sm:h-[calc(100vh-4rem)] border-r border-slate-800/90 bg-slate-900/95 backdrop-blur-md shadow-md overflow-x-hidden overflow-y-auto transition-[width] duration-200` : 'sticky top-16 z-20 border-b border-slate-800/90 bg-slate-900/95 backdrop-blur-md shadow-md'}>
      <div className={layout === 'sidebar' ? 'p-1 sm:p-3' : 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8'}>
        {layout === 'sidebar' && <button type="button" onClick={() => setSidebarExpanded((expanded) => !expanded)} aria-label={sidebarExpanded ? 'Recolher menu lateral' : 'Expandir menu lateral'} title={sidebarExpanded ? 'Recolher menu' : 'Expandir menu'} className="mb-2 flex w-full items-center justify-center rounded-lg p-2 text-slate-300 hover:bg-slate-800 hover:text-white">{sidebarExpanded ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}{sidebarExpanded && <span className="ml-2 text-xs">Recolher menu</span>}</button>}
        <nav className={layout === 'sidebar' ? 'flex flex-col gap-1 py-2' : 'flex space-x-2 sm:space-x-6 overflow-x-auto py-2.5 no-scrollbar'}>
          {steps.map((step) => {
            const Icon = step.icon;
            const isActive = currentStep === step.id;

            return (
              <a
                key={step.id}
                data-step={step.id}
                data-href={`?step=${step.id}`}
                href={`?step=${step.id}`}
                onClick={(event) => {
                  // Keep native link behaviors such as Ctrl-click, middle-click and context-menu tabs.
                  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                  event.preventDefault();
                  if (step.id === 'overview') onOverview();
                  else onStepChange(step.id);
                }}
                title={step.label}
                className={`inline-flex items-center gap-2 py-2 px-2 sm:px-3.5 text-xs sm:text-sm font-semibold rounded-lg transition cursor-pointer select-none ${layout === 'sidebar' ? `w-full ${sidebarExpanded ? 'justify-start whitespace-normal break-normal' : 'justify-center'}` : 'whitespace-nowrap'} ${
                  isActive
                    ? 'bg-blue-600/20 text-blue-400 border border-blue-500/40 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-blue-400' : 'text-slate-500'}`} />
                <span className={layout === 'sidebar' ? (sidebarExpanded ? 'inline min-w-0 flex-1 whitespace-normal break-normal leading-tight' : 'hidden') : ''}>{step.label}</span>
                {step.badge && (
                  <span
                    className={`ml-1 shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold ${layout === 'sidebar' ? 'hidden' : ''} ${
                      isActive
                        ? 'bg-blue-500 text-white shadow-sm'
                        : isExecuting && step.id === 'execution'
                        ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30 animate-pulse'
                        : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    {step.badge}
                  </span>
                )}
              </a>
            );
          })}
        </nav>
      </div>
    </div>
  );
};
