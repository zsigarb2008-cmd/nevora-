import { useState, type FormEvent } from 'react';
import { ArrowUp, Command } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAgency } from '../hooks/useAgency';

export function CommandCenter() {
  const [command, setCommand] = useState('');
  const [clientId, setClientId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const { runCommand, state } = useAgency();
  const navigate = useNavigate();

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!command.trim()) return;
    try {
      const id = await runCommand(command, clientId || null);
      setNotice(`Task stored in the workspace as ${id.slice(0, 8)}.`);
      setError('');
      setCommand('');
      setClientId('');
      navigate('/tasks');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The command could not be queued.');
      setNotice('');
    }
  };

  return (
    <section className="command-panel" aria-label="Command Center">
      <div className="command-label"><span className="command-glyph"><Command size={16} /></span><span>COMMAND CENTER</span><span className="command-hint">ROUTE A REQUEST</span></div>
      <form onSubmit={submit} className="command-form">
        <label className="sr-only" htmlFor="global-command">Enter a request</label>
        <input id="global-command" value={command} onChange={(event) => setCommand(event.target.value)} placeholder="What should Novera work on?" />
        <button className="icon-button command-submit" type="submit" aria-label="Queue command" title="Queue command" disabled={!command.trim()}><ArrowUp size={17} /></button>
      </form>
      <label className="command-client-label">Client context
        <select value={clientId} onChange={(event) => setClientId(event.target.value)} aria-label="Client context">
          <option value="">No client linked</option>
          {state.clients.map((client) => <option key={client.id} value={client.id}>Client context: {client.company || client.name}</option>)}
        </select>
      </label>
      <div className="command-feedback" aria-live="polite">{error || notice || 'Research tasks run through the server-side worker; other employees remain queued until connected.'}</div>
    </section>
  );
}