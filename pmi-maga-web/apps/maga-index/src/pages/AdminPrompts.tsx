import { useState, useEffect, useRef } from 'react';
import Layout from '../components/Layout';
import type { PromptRecord } from '@micah/types';
import { fetchPrompts, savePrompts } from '@micah/api';

const REASONING_EFFORT_OPTIONS = ['', 'none', 'minimal', 'low', 'medium', 'high', 'xhigh'];

interface PromptCardProps {
  promptKey: string;
  data: PromptRecord;
  onChange: (key: string, data: PromptRecord) => void;
  onSave: (key: string) => void;
  saving: boolean;
}

function PromptCard({ promptKey, data, onChange, onSave, saving }: PromptCardProps) {
  const [expanded, setExpanded] = useState(false);
  const reasoningActive = data.reasoning_effort && data.reasoning_effort !== 'none';

  const update = (field: keyof PromptRecord, value: string | number | null) => {
    onChange(promptKey, { ...data, [field]: value });
  };

  return (
    <div className="bg-bg-secondary border border-border-tertiary rounded-lg overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-bg-dark-primary/30 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-3">
          <span className="font-mono text-sm font-semibold text-utility-orange">{promptKey}</span>
          <div className="flex gap-2">
            {data.model && (
              <span className="text-xs px-2 py-0.5 bg-bg-dark-primary rounded text-text-tertiary border border-border-tertiary">
                {data.model}
              </span>
            )}
            {data.temperature !== null && (
              <span className="text-xs px-2 py-0.5 bg-bg-dark-primary rounded text-text-tertiary border border-border-tertiary">
                temp={data.temperature}
              </span>
            )}
            {data.reasoning_effort && (
              <span className="text-xs px-2 py-0.5 bg-bg-dark-primary rounded text-text-tertiary border border-border-tertiary">
                reasoning={data.reasoning_effort}
              </span>
            )}
          </div>
        </div>
        <svg
          className={`w-5 h-5 text-text-tertiary transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="px-5 pb-5 space-y-4 border-t border-border-tertiary pt-4">
          {/* Inference params row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs text-text-tertiary mb-1">Model</label>
              <input
                type="text"
                value={data.model || ''}
                onChange={e => update('model', e.target.value || null)}
                placeholder="default (gpt-5.2)"
                className="w-full px-3 py-2 text-sm bg-bg-dark-primary border border-border-tertiary rounded-lg text-text-primary placeholder-text-tertiary/50 focus:outline-none focus:border-utility-orange"
              />
            </div>
            <div>
              <label className="block text-xs text-text-tertiary mb-1">Reasoning Effort</label>
              <select
                value={data.reasoning_effort || ''}
                onChange={e => update('reasoning_effort', e.target.value || null)}
                className="w-full px-3 py-2 text-sm bg-bg-dark-primary border border-border-tertiary rounded-lg text-text-primary focus:outline-none focus:border-utility-orange"
              >
                {REASONING_EFFORT_OPTIONS.map(opt => (
                  <option key={opt} value={opt}>
                    {opt || '-- default --'}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-text-tertiary mb-1">
                Temperature {reasoningActive && <span className="text-bg-red">(disabled)</span>}
              </label>
              <input
                type="number"
                min={0} max={2} step={0.1}
                value={data.temperature ?? ''}
                onChange={e => update('temperature', e.target.value ? parseFloat(e.target.value) : null)}
                disabled={!!reasoningActive}
                placeholder="default (1.0)"
                className="w-full px-3 py-2 text-sm bg-bg-dark-primary border border-border-tertiary rounded-lg text-text-primary placeholder-text-tertiary/50 focus:outline-none focus:border-utility-orange disabled:opacity-40 disabled:cursor-not-allowed"
              />
            </div>
            <div>
              <label className="block text-xs text-text-tertiary mb-1">
                Top P {reasoningActive && <span className="text-bg-red">(disabled)</span>}
              </label>
              <input
                type="number"
                min={0} max={1} step={0.05}
                value={data.top_p ?? ''}
                onChange={e => update('top_p', e.target.value ? parseFloat(e.target.value) : null)}
                disabled={!!reasoningActive}
                placeholder="default (1.0)"
                className="w-full px-3 py-2 text-sm bg-bg-dark-primary border border-border-tertiary rounded-lg text-text-primary placeholder-text-tertiary/50 focus:outline-none focus:border-utility-orange disabled:opacity-40 disabled:cursor-not-allowed"
              />
            </div>
          </div>

          {/* Compatibility warning */}
          {data.temperature !== null && data.top_p !== null && (
            <p className="text-xs text-utility-orange">
              OpenAI recommends setting temperature OR top_p, not both.
            </p>
          )}

          {/* Content textarea */}
          <div>
            <label className="block text-xs text-text-tertiary mb-1">
              Prompt Content ({data.content.length} chars)
            </label>
            <textarea
              value={data.content}
              onChange={e => update('content', e.target.value)}
              rows={12}
              className="w-full px-3 py-2 text-sm font-mono bg-bg-dark-primary border border-border-tertiary rounded-lg text-text-primary focus:outline-none focus:border-utility-orange resize-y leading-relaxed"
              spellCheck={false}
            />
          </div>

          {/* Save button */}
          <div className="flex justify-end">
            <button
              onClick={() => onSave(promptKey)}
              disabled={saving}
              className="px-5 py-2 bg-utility-orange hover:bg-bg-red text-white rounded-lg text-sm font-medium transition-colors cursor-pointer disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminPrompts(): React.ReactElement {
  const [prompts, setPrompts] = useState<Record<string, PromptRecord>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    fetchPrompts()
      .then(data => {
        setPrompts(data);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  const handleChange = (key: string, data: PromptRecord) => {
    setPrompts(prev => ({ ...prev, [key]: data }));
  };

  const handleSave = async (key: string) => {
    setSaving(key);
    setError(null);
    setSuccess(null);
    try {
      await savePrompts({ [key]: prompts[key] });
      setSuccess(`Saved "${key}" successfully.`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(null);
    }
  };

  const handleSaveAll = async () => {
    setSaving('__all__');
    setError(null);
    setSuccess(null);
    try {
      await savePrompts(prompts);
      setSuccess(`Saved all ${Object.keys(prompts).length} prompts.`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(null);
    }
  };

  const sortedKeys = Object.keys(prompts).sort();

  return (
    <Layout>
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-text-primary">Prompt Editor</h1>
            <p className="text-sm text-text-tertiary mt-1">
              {sortedKeys.length} prompts &middot; Edit LLM prompts and inference parameters
            </p>
          </div>
          <button
            onClick={handleSaveAll}
            disabled={saving !== null}
            className="px-5 py-2 bg-utility-orange hover:bg-bg-red text-white rounded-lg text-sm font-medium transition-colors cursor-pointer disabled:opacity-50"
          >
            {saving === '__all__' ? 'Saving All...' : 'Save All'}
          </button>
        </div>

        {/* Status messages */}
        {error && (
          <div className="mb-4 px-4 py-3 bg-bg-red/10 border border-bg-red/30 rounded-lg text-bg-red text-sm">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-4 px-4 py-3 bg-green-900/20 border border-green-700/30 rounded-lg text-green-400 text-sm">
            {success}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="text-text-tertiary text-center py-12">Loading prompts...</div>
        )}

        {/* Prompt cards */}
        <div className="space-y-3">
          {sortedKeys.map(key => (
            <PromptCard
              key={key}
              promptKey={key}
              data={prompts[key]}
              onChange={handleChange}
              onSave={handleSave}
              saving={saving === key || saving === '__all__'}
            />
          ))}
        </div>
      </div>
    </Layout>
  );
}
