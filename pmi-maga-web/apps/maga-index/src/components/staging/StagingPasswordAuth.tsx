import { type ChangeEvent, type CSSProperties, type KeyboardEvent } from 'react';

export type StagingPasswordAuthProps = {
  password: string;
  setPassword: (value: string) => void;
  passwordError: boolean;
  onSubmit: () => void;
};

export function StagingPasswordAuth({
  password,
  setPassword,
  passwordError,
  onSubmit,
}: StagingPasswordAuthProps) {
  return (
    <>
      <div className="w-12 h-12 bg-bg-dark-primary rounded-lg flex items-center justify-center mx-auto mb-4 border border-border-tertiary">
        <svg className="w-6 h-6 text-text-tertiary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
          />
        </svg>
      </div>
      <h2 className="text-2xl font-bold text-text-primary mb-2">The War Index</h2>
      <p className="text-text-tertiary mb-6">Enter password to continue</p>
      <input
        type="text"
        value={password}
        onChange={(e: ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
        onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && onSubmit()}
        className="w-full px-4 py-3 rounded-lg bg-bg-dark-primary border border-border-tertiary focus:outline-none focus:border-utility-orange mb-4 text-center text-text-primary"
        placeholder="Password"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck="false"
        data-1p-ignore
        data-lpignore="true"
        style={{ WebkitTextSecurity: 'disc' } as CSSProperties}
        autoFocus
      />
      <button
        type="button"
        onClick={onSubmit}
        className="w-full py-3 bg-utility-orange hover:bg-bg-red text-white rounded-lg font-medium transition-colors cursor-pointer"
      >
        Continue
      </button>
      {passwordError && <p className="text-bg-red mt-3 text-sm">Incorrect password</p>}
    </>
  );
}
