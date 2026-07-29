// src/app/login/page.js
'use client';
import { useState } from 'react';
import { login } from '@/lib/api';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const router = useRouter();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      const data = await login(email, password);
      localStorage.setItem('ai_platform_token', data.token);
      router.replace('/chat');
    } catch (err) {
      setError(err.message || 'Login failed');
    }
  };

  return (
    <div className="flex-center min-h-screen glass rounded p-8 max-w-md mx-auto">
      <form className="w-full" onSubmit={handleSubmit}>
        <h2 className="text-2xl font-bold mb-6 text-center">Sign In</h2>
        {error && <p className="text-danger mb-4 text-center">{error}</p>}
        <input
          type="email"
          placeholder="Email"
          className="w-full mb-4 p-2 rounded bg-bg-surface text-primary"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="Password"
          className="w-full mb-6 p-2 rounded bg-bg-surface text-primary"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button
          type="submit"
          className="w-full py-2 bg-accent text-primary font-semibold rounded hover:bg-accent-purple transition"
        >
          Sign In
        </button>
      </form>
    </div>
  );
}
