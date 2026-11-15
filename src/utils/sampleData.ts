import { CandidateProfile } from '../types/index.js';

export const SAMPLE_COMPANIES_CSV = `empresa;site;setor
Stripe;https://stripe.com;Fintech / Pagamentos Globais
Nubank;https://nubank.com.br;Banco Digital / Tecnologia Financeira
Vercel;https://vercel.com;Plataforma Cloud & Frontend
ContaAzul;https://contaazul.com;SaaS ERP e Finanças
Supabase;https://supabase.com;Backend as a Service / Banco de Dados
`;

export const SAMPLE_PROFILE: CandidateProfile = {
  name: 'Pessoa Exemplo',
  email: 'pessoa@example.com',
  phone: '+1 202-555-0100',
  location: 'Brasil',
  summary:
    'Profissional de tecnologia com experiência em desenvolvimento de aplicações web, APIs e colaboração com equipes multidisciplinares.',
  targetRoles: [
    'Desenvolvedor(a) de Software',
    'Desenvolvedor(a) Full Stack',
  ],
  prioritySkills: [
    'TypeScript',
    'Node.js',
    'React',
    'PostgreSQL',
    'Docker',
    'Serviços de nuvem',
    'Desenvolvimento web',
    'GraphQL',
    'Design de APIs RESTful',
    'CI/CD',
  ],
  workPreference: 'remote',
  professionalLinks: [
    { label: 'LinkedIn', url: 'https://linkedin.com/in/example' },
    { label: 'GitHub', url: 'https://github.com/example' },
    { label: 'Portfólio', url: 'https://example.com' },
  ],
  experiences: [
    {
      role: 'Desenvolvedor(a) de Software',
      company: 'Empresa Exemplo',
      period: '2022 - Atual',
      highlights: [
        'Contribuiu para o desenvolvimento e a manutenção de aplicações web.',
        'Colaborou com a equipe para melhorar a qualidade e a confiabilidade do software.',
      ],
    },
    {
      role: 'Desenvolvedor(a) Júnior',
      company: 'Outra Empresa Exemplo',
      period: '2020 - 2022',
      highlights: [
        'Apoiou a implementação de funcionalidades e correções em sistemas existentes.',
        'Participou de revisões de código e atividades de teste.',
      ],
    },
  ],
  education: [
    'Formação superior em área relacionada à tecnologia',
  ],
  certifications: [],
  languages: ['Português', 'Inglês'],
  writingStyleSample:
    'Comunicação direta, analítica e elegante. Foco em soluções práticas, mensuráveis e impacto nos objetivos do negócio, sem formalismo excessivo ou jargões vazios.',
  additionalNotes:
    'Disponível para avaliar oportunidades remotas ou híbridas.',
  materialLanguage: 'pt',
  parsedFromCv: true,
};
