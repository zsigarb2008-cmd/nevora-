// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import App from './App';

const routes = [
  ['/login', 'Welcome back.'],
  ['/dashboard', 'Good work starts with clarity.'],
  ['/ai-employees', 'AI employees'],
  ['/ai-employees/research', 'Research AI'],
  ['/ai-employees/sales', 'Sales AI'],
  ['/ai-employees/website', 'Website AI'],
  ['/ai-employees/copy', 'Copy AI'],
  ['/ai-employees/seo', 'SEO AI'],
  ['/ai-employees/qa', 'QA AI'],
  ['/ai-employees/support', 'Support AI'],
  ['/clients', 'Clients'],
  ['/projects', 'Projects'],
  ['/tasks', 'Tasks'],
  ['/workflows', 'Workflows'],
  ['/approvals', 'Approvals'],
  ['/activity', 'Activity'],
  ['/settings', 'Settings'],
] as const;

function renderRoute(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);
}

beforeEach(() => {
  localStorage.clear();
  let sequence = 0;
  vi.spyOn(crypto, 'randomUUID').mockImplementation(() => `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('application routes', () => {
  it.each(routes)('renders %s', async (path, heading) => {
    renderRoute(path);
    expect(await screen.findByRole('heading', { name: heading })).toBeTruthy();
  });
});

describe('workspace interactions', () => {
  it('creates a client record from the CRM form', async () => {
    const user = userEvent.setup();
    renderRoute('/clients');
    await user.click(screen.getByRole('button', { name: 'Add client' }));
    await user.type(screen.getByLabelText('Name'), 'Morgan Lee');
    await user.type(screen.getByLabelText('Company'), 'North Star Cafe');
    await user.click(screen.getByRole('button', { name: 'Save client' }));
    expect(await screen.findByText('North Star Cafe')).toBeTruthy();
    expect(screen.getByText('NEW')).toBeTruthy();
  });

  it('routes a command to a queued specialist task without inventing output', async () => {
    const user = userEvent.setup();
    renderRoute('/dashboard');
    await user.type(screen.getByLabelText('Enter a request'), 'Create a website plan');
    await user.click(screen.getByRole('button', { name: 'Queue command' }));
    expect(await screen.findByRole('heading', { name: 'Tasks' })).toBeTruthy();
    const task = screen.getByText('Create a website plan').closest('details');
    expect(task).toBeTruthy();
    expect(within(task as HTMLElement).getByText('website')).toBeTruthy();
    expect(within(task as HTMLElement).getByText('QUEUED')).toBeTruthy();
  });

  it('queues a test workflow with actual task and handoff records', async () => {
    const user = userEvent.setup();
    renderRoute('/workflows');
    await user.click(screen.getByRole('button', { name: 'Queue workflow' }));
    await user.click(screen.getByRole('button', { name: 'Queue test Novera workflow' }));
    expect(await screen.findByText(/queued with seven task records and six handoffs/)).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Test Novera workflow' })).toBeTruthy();
    expect(screen.getByText(/Research AI/)).toBeTruthy();
    expect(screen.getByText(/Human approval/)).toBeTruthy();
  });

  it('records a human approval decision', async () => {
    const user = userEvent.setup();
    renderRoute('/approvals');
    await user.click(screen.getByRole('button', { name: 'Request approval' }));
    await user.type(screen.getByLabelText('Request title'), 'Review launch draft');
    await user.type(screen.getByLabelText('What will happen'), 'A draft will be published.');
    await user.type(screen.getByLabelText('Why'), 'The client requested a review.');
    await user.type(screen.getByLabelText('AI recommendation'), 'Review the exact preview first.');
    await user.type(screen.getByLabelText('Preview'), 'Draft only.');
    await user.click(screen.getByRole('button', { name: 'Submit for review' }));
    const approval = await screen.findByRole('heading', { name: 'Review launch draft' });
    await user.click(within(approval.closest('article') as HTMLElement).getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(screen.getByText('APPROVED')).toBeTruthy());
  });
});