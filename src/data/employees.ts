import type { EmployeeDefinition } from '../types';

export const employees: EmployeeDefinition[] = [
  { key: 'research', name: 'Research AI', description: 'Business research, website analysis, and structured lead reports.', path: '/ai-employees/research' },
  { key: 'sales', name: 'Sales AI', description: 'Lead qualification, tailored outreach drafts, and follow-up planning.', path: '/ai-employees/sales' },
  { key: 'website', name: 'Website AI', description: 'Sitemaps, page structures, and implementation plans.', path: '/ai-employees/website' },
  { key: 'copy', name: 'Copy AI', description: 'Website messaging and search-ready content drafts.', path: '/ai-employees/copy' },
  { key: 'seo', name: 'SEO AI', description: 'Keyword strategy, on-page structure, and local SEO recommendations.', path: '/ai-employees/seo' },
  { key: 'qa', name: 'QA AI', description: 'Structured checks for accessibility, content, links, and responsive behavior.', path: '/ai-employees/qa' },
  { key: 'support', name: 'Support AI', description: 'Grounded client and project support with human escalation.', path: '/ai-employees/support' },
];