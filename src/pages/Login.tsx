/*
 * Developed by Nerdshouse Technologies LLP — https://nerdshouse.com
 * © 2026 WhiteRock (Royal Enterprise). All rights reserved.
 *
 * Unauthorized copying, modification, or distribution is strictly prohibited.
 */
import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';
import { useNavigate } from 'react-router-dom';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { AlertTriangle, ArrowLeft, MessageSquare, Phone } from 'lucide-react';
import { BrandLogo, DeveloperCredit } from '../components/ui/BrandLogo';
import { PhoneInput } from '../components/ui/PhoneInput';

const RESEND_COOLDOWN_SECONDS = 30;

const maskPhone = (phone: string) => {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return phone;
  return `•••••• ${digits.slice(-4)}`;
};

export const Login: React.FC = () => {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const otpInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = window.setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [resendIn]);

  useEffect(() => {
    if (step === 'otp') otpInputRef.current?.focus();
  }, [step]);

  const sendOtp = async () => {
    setError('');
    setLoading(true);
    try {
      await api.requestLoginOtp(phone);
      setStep('otp');
      setOtp('');
      setResendIn(RESEND_COOLDOWN_SECONDS);
    } catch (err: any) {
      setError(err?.message || 'Failed to send OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    await sendOtp();
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length !== 6) {
      setError('Enter the 6-digit code.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await login(phone, otp);
      navigate('/');
    } catch (err: any) {
      setError(err?.message || 'Invalid OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const backToPhone = () => {
    setStep('phone');
    setOtp('');
    setError('');
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-card border border-slate-200 shadow-card px-6 sm:px-8 py-8">
          <div className="flex justify-center pb-8 pt-2 text-brand-600">
            <BrandLogo size="lg" />
          </div>

          {error && (
            <div className="bg-danger-50 border border-danger-100 text-danger-700 p-3 rounded-control mb-5 flex items-start gap-2.5">
              <AlertTriangle size={18} className="shrink-0 mt-0.5 text-danger-500" />
              <p className="text-sm font-medium">{error}</p>
            </div>
          )}

          {step === 'phone' ? (
            <form onSubmit={handleSendOtp} className="space-y-5">
              <div className="text-center mb-2">
                <div className="w-12 h-12 rounded-full bg-brand-50 flex items-center justify-center mx-auto mb-3">
                  <Phone size={20} className="text-brand-600" />
                </div>
                <h2 className="text-lg font-semibold text-slate-900">Sign in with WhatsApp</h2>
                <p className="text-sm text-slate-500 mt-1">
                  Enter your registered mobile number. We&apos;ll send a one-time code on WhatsApp.
                </p>
              </div>
              <PhoneInput
                label="Mobile Number"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                autoFocus
                placeholder="98765 43210"
              />
              <Button type="submit" className="w-full h-11 text-sm font-semibold" isLoading={loading}>
                Send OTP
              </Button>
            </form>
          ) : (
            <form onSubmit={handleVerify} className="space-y-5">
              <button
                type="button"
                onClick={backToPhone}
                className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors"
              >
                <ArrowLeft size={15} />
                Change number
              </button>
              <div className="text-center mb-2">
                <div className="w-12 h-12 rounded-full bg-success-50 flex items-center justify-center mx-auto mb-3">
                  <MessageSquare size={20} className="text-success-600" />
                </div>
                <h2 className="text-lg font-semibold text-slate-900">Enter the code</h2>
                <p className="text-sm text-slate-500 mt-1">
                  Sent on WhatsApp to <span className="font-medium text-slate-700">{maskPhone(phone)}</span>
                </p>
              </div>
              <Input
                ref={otpInputRef}
                label="One-time code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                required
                placeholder="123456"
                maxLength={6}
                className="text-center text-lg tracking-[0.4em] font-semibold"
              />
              <Button
                type="submit"
                className="w-full h-11 text-sm font-semibold"
                isLoading={loading}
                disabled={otp.length !== 6}
              >
                Verify &amp; Sign in
              </Button>
              <div className="text-center">
                {resendIn > 0 ? (
                  <p className="text-sm text-slate-400">Resend code in {resendIn}s</p>
                ) : (
                  <button
                    type="button"
                    onClick={sendOtp}
                    disabled={loading}
                    className="text-sm text-brand-600 hover:text-brand-800 font-medium disabled:opacity-50"
                  >
                    Resend code
                  </button>
                )}
              </div>
            </form>
          )}
        </div>
        <p className="text-center text-xs text-slate-400 mt-4">
          No account? Contact your administrator to get added.
        </p>
        <DeveloperCredit className="text-center mt-6" />
      </div>
    </div>
  );
};
