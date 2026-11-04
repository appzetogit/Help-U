import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { FiUser, FiMail, FiPhone, FiArrowRight, FiChevronLeft, FiCheckCircle, FiGift } from 'react-icons/fi';
import { toast } from 'react-hot-toast';
import { themeColors } from '../../../theme';
import { userAuthService } from '../../../services/authService';
import Logo from '../../../components/common/Logo';
import LogoLoader from '../../../components/common/LogoLoader';
import { cleanIndianPhoneNumber } from '../../../utils/phoneUtils';

import { z } from "zod";

// Zod schema
const signupSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").regex(/^[a-zA-Z\s]+$/, "Name can only contain letters"),
  email: z.string().optional().refine(val => !val || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val), "Invalid email address"),
  phoneNumber: z.string().regex(/^[6-9]\d{9}$/, "Please enter a valid 10-digit Indian phone number"),
});

const Signup = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [step, setStep] = useState('details'); // 'details' or 'otp'
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phoneNumber: ''
  });
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [otpToken, setOtpToken] = useState('');
  const [verificationToken, setVerificationToken] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [termsError, setTermsError] = useState(false);
  // Referral code from a shared link (?ref=CODE), kept across the login → signup hop.
  const [referralCode, setReferralCode] = useState(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('ref');
    if (fromUrl) {
      try { localStorage.setItem('pendingReferralCode', fromUrl.toUpperCase()); } catch { /* storage unavailable */ }
      return fromUrl.toUpperCase();
    }
    try { return localStorage.getItem('pendingReferralCode') || ''; } catch { return ''; }
  });

  // Timer countdown effect
  useEffect(() => {
    let interval;
    if (resendTimer > 0) {
      interval = setInterval(() => {
        setResendTimer((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [resendTimer]);

  // Refs for auto-focus
  const nameInputRef = useRef(null);
  const otpInputRefs = useRef([]);

  // Pre-fill from navigation state (Unified Flow)
  useEffect(() => {
    if (location.state?.phone && location.state?.verificationToken) {
      setFormData(prev => ({ ...prev, phoneNumber: location.state.phone }));
      setVerificationToken(location.state.verificationToken);
    }
  }, [location.state]);

  // Auto-focus logic
  useEffect(() => {
    if (step === 'details' && nameInputRef.current) {
      setTimeout(() => nameInputRef.current.focus(), 100);
    } else if (step === 'otp' && otpInputRefs.current[0]) {
      setTimeout(() => otpInputRefs.current[0].focus(), 100);
    }
  }, [step]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleDetailsSubmit = async (e) => {
    e.preventDefault();

    // Zod Validation
    const validationResult = signupSchema.safeParse(formData);

    if (!validationResult.success) {
      // Only one toast is visible at a time (ToastLimiter), so show the first error
      toast.error(validationResult.error.errors[0].message);
      return;
    }

    if (!acceptedTerms) {
      setTermsError(true);
      toast.error('Please accept the Terms & Conditions and Privacy Policy to continue');
      return;
    }

    setIsLoading(true);

    if (verificationToken) {
      try {
        const response = await userAuthService.register({
          name: formData.name,
          email: formData.email || null,
          verificationToken,
          referralCode: referralCode.trim() || undefined
        });
        if (response.success) {
          try { localStorage.removeItem('pendingReferralCode'); } catch { /* storage unavailable */ }
          try {
            const { registerFCMToken } = await import('../../../services/pushNotificationService');
            await registerFCMToken('user', true);
          } catch (e) { console.error(e); }

          toast.success(
            <div className="flex flex-col">
              <span className="font-bold">Welcome to Help U!</span>
              <span className="text-xs">Your account has been created successfully.</span>
            </div>,
            { icon: <FiCheckCircle className="text-green-500" /> }
          );
          navigate('/user');
        } else {
          toast.error(response.message || 'Registration failed');
        }
      } catch (error) {
        toast.error(error.response?.data?.message || 'Registration failed');
      } finally {
        setIsLoading(false);
      }
      return;
    }

    try {
      const response = await userAuthService.sendOTP(formData.phoneNumber, formData.email || null);
      if (response.success) {
        setOtpToken(response.token);
        setIsLoading(false);
        setStep('otp');
        setResendTimer(120); // Start timer
        toast.success('OTP sent successfully');
      } else {
        setIsLoading(false);
        toast.error(response.message || 'Failed to send OTP');
      }
    } catch (error) {
      setIsLoading(false);
      toast.error(error.response?.data?.message || 'Failed to send OTP. Please try again.');
    }
  };

  const handleOtpChange = (index, value) => {
    const cleanValue = value.replace(/\D/g, '').slice(0, 1);
    const newOtp = [...otp];
    newOtp[index] = cleanValue;
    setOtp(newOtp);

    if (cleanValue && index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    }
  };

  // Auto-verify as last digit enters
  useEffect(() => {
    const otpValue = otp.join('');
    if (otpValue.length === 6 && !isLoading && otpToken) {
      handleOtpSubmit();
    }
  }, [otp]);

  const handleOtpSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!acceptedTerms) {
      setTermsError(true);
      toast.error('Please accept the Terms & Conditions and Privacy Policy');
      return;
    }
    const otpValue = otp.join('');
    if (otpValue.length !== 6) {
      toast.error('Please enter complete OTP');
      return;
    }
    if (!otpToken) {
      toast.error('Please request OTP first');
      return;
    }
    setIsLoading(true);
    try {
      const response = await userAuthService.register({
        name: formData.name,
        email: formData.email || null,
        phone: formData.phoneNumber,
        otp: otpValue,
        token: otpToken,
        referralCode: referralCode.trim() || undefined
      });
      if (response.success) {
        try { localStorage.removeItem('pendingReferralCode'); } catch { /* storage unavailable */ }
        setIsLoading(false);
        try {
          const { registerFCMToken } = await import('../../../services/pushNotificationService');
          await registerFCMToken('user', true);
        } catch (fcmError) {
          console.error('FCM Registration failed on signup:', fcmError);
        }

        toast.success(
          <div className="flex flex-col">
            <span className="font-bold">Welcome to Help U!</span>
            <span className="text-xs">Account created successfully.</span>
          </div>,
          { icon: <FiCheckCircle className="text-green-500" /> }
        );
        navigate('/user');
      } else {
        setIsLoading(false);
        toast.error(response.message || 'Registration failed');
      }
    } catch (error) {
      setIsLoading(false);
      toast.error(error.response?.data?.message || 'Registration failed. Please try again.');
    }
  };

  const brandColor = themeColors.brand?.navy || '#163B66';

  return (
    <div className="min-h-[100dvh] bg-white flex flex-col justify-between py-6 px-4 sm:py-10 sm:px-6 lg:px-8 relative overflow-x-hidden selection:bg-[#163B66]/10 selection:text-[#163B66]">
      {/* Ultra-subtle Apple Ambient Glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <div className="absolute -top-32 -left-32 w-80 h-80 bg-[#163B66]/[0.025] rounded-full blur-3xl" />
        <div className="absolute -bottom-32 -right-32 w-80 h-80 bg-[#D68F35]/[0.025] rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-sm sm:max-w-md mx-auto text-center relative z-10 pt-2 sm:pt-4 animate-fade-in">
        <div className="flex justify-center mb-5">
          <Logo className="h-20 sm:h-24 w-auto object-contain transition-transform duration-300 hover:scale-105" />
        </div>
        <h1 className="text-[26px] sm:text-[30px] font-bold text-slate-900 tracking-[-0.025em]">
          {step === 'details' ? 'Create Account' : 'Verify Phone'}
        </h1>
        <p className="mt-1.5 text-[14px] sm:text-[15px] text-slate-500 font-normal leading-relaxed animate-stagger-1 animate-fade-in">
          {step === 'details' ? 'Join Help U to start booking services' : `We've sent a 6-digit code to ${formData.phoneNumber}`}
        </p>
      </div>

      <div className="w-full max-w-sm sm:max-w-md mx-auto my-auto relative z-10 py-3">
        <div className="bg-white rounded-3xl border border-slate-100/90 shadow-[0_10px_35px_-5px_rgba(22,59,102,0.06),0_1px_3px_rgba(0,0,0,0.02)] p-6 sm:p-8 relative overflow-hidden animate-slide-in-bottom">
          {/* Refined Brand Gradient Accent Line */}
          <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-[#163B66] via-[#D68F35] to-[#BB5F36]" />

          {step === 'details' ? (
            <form onSubmit={handleDetailsSubmit} className="space-y-4" noValidate>
              {verificationToken && (
                <button
                  type="button"
                  onClick={() => navigate('/user/login')}
                  className="flex items-center text-sm font-medium text-slate-500 hover:text-[#163B66] transition-colors mb-3 animate-fade-in active:scale-95"
                >
                  <FiChevronLeft className="mr-0.5 text-base" /> Back to Login
                </button>
              )}

              <div className="animate-stagger-1 animate-fade-in">
                <label htmlFor="name" className="block text-[13px] font-semibold text-slate-700 mb-1.5 tracking-tight">
                  Full Name
                </label>
                <div className="relative rounded-2xl group transition-all duration-200">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 group-focus-within:text-[#163B66] transition-colors">
                    <FiUser className="h-[18px] w-[18px]" />
                  </div>
                  <input
                    ref={nameInputRef}
                    id="name"
                    name="name"
                    type="text"
                    required
                    value={formData.name}
                    onChange={handleInputChange}
                    className="block w-full pl-10 pr-4 py-3 bg-slate-50/70 hover:bg-slate-50 focus:bg-white text-slate-900 font-medium placeholder-slate-400 text-[15px] border border-slate-200/90 rounded-2xl outline-none transition-all duration-200 focus:border-[#163B66] focus:ring-4 focus:ring-[#163B66]/10 shadow-[0_1px_2px_rgba(0,0,0,0.02)]"
                    placeholder="Enter your full name"
                  />
                </div>
              </div>

              <div className="animate-stagger-2 animate-fade-in">
                <label htmlFor="email" className="block text-[13px] font-semibold text-slate-700 mb-1.5 tracking-tight">
                  Email <span className="text-slate-400 text-xs font-normal ml-1">(Optional)</span>
                </label>
                <div className="relative rounded-2xl group transition-all duration-200">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 group-focus-within:text-[#163B66] transition-colors">
                    <FiMail className="h-[18px] w-[18px]" />
                  </div>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    className="block w-full pl-10 pr-4 py-3 bg-slate-50/70 hover:bg-slate-50 focus:bg-white text-slate-900 font-medium placeholder-slate-400 text-[15px] border border-slate-200/90 rounded-2xl outline-none transition-all duration-200 focus:border-[#163B66] focus:ring-4 focus:ring-[#163B66]/10 shadow-[0_1px_2px_rgba(0,0,0,0.02)]"
                    placeholder="you@example.com"
                  />
                </div>
              </div>

              <div className="animate-stagger-2 animate-fade-in">
                <label htmlFor="referralCode" className="block text-[13px] font-semibold text-slate-700 mb-1.5 tracking-tight">
                  Referral Code <span className="text-slate-400 text-xs font-normal ml-1">(Optional)</span>
                </label>
                <div className="relative rounded-2xl group transition-all duration-200">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 group-focus-within:text-[#163B66] transition-colors">
                    <FiGift className="h-[18px] w-[18px]" />
                  </div>
                  <input
                    id="referralCode"
                    name="referralCode"
                    type="text"
                    autoCapitalize="characters"
                    value={referralCode}
                    onChange={(e) => setReferralCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20))}
                    className="block w-full pl-10 pr-4 py-3 bg-slate-50/70 hover:bg-slate-50 focus:bg-white text-slate-900 font-medium placeholder-slate-400 text-[15px] border border-slate-200/90 rounded-2xl outline-none transition-all duration-200 focus:border-[#163B66] focus:ring-4 focus:ring-[#163B66]/10 shadow-[0_1px_2px_rgba(0,0,0,0.02)] tracking-widest"
                    placeholder="Friend's code"
                  />
                </div>
              </div>

              {!verificationToken && (
                <div className="animate-stagger-3 animate-fade-in">
                  <label htmlFor="phoneNumber" className="block text-[13px] font-semibold text-slate-700 mb-1.5 tracking-tight">
                    Phone Number
                  </label>
                  <div className="relative rounded-2xl group transition-all duration-200">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 group-focus-within:text-[#163B66] transition-colors">
                      <FiPhone className="h-[18px] w-[18px]" />
                    </div>
                    <div className="absolute inset-y-0 left-10 flex items-center pointer-events-none">
                      <span className="text-slate-700 font-semibold text-sm border-r border-slate-200/90 pr-2.5">+91</span>
                    </div>
                    <input
                      id="phoneNumber"
                      name="phone"
                      type="tel"
                      inputMode="numeric"
                      autoComplete="tel-national tel"
                      required
                      value={formData.phoneNumber}
                      onChange={(e) => {
                        const cleaned = cleanIndianPhoneNumber(e.target.value);
                        setFormData(prev => ({ ...prev, phoneNumber: cleaned }));
                      }}
                      onInput={(e) => {
                        const cleaned = cleanIndianPhoneNumber(e.target.value);
                        if (cleaned !== formData.phoneNumber) {
                          setFormData(prev => ({ ...prev, phoneNumber: cleaned }));
                        }
                      }}
                      className="block w-full pl-24 pr-4 py-3 bg-slate-50/70 hover:bg-slate-50 focus:bg-white text-slate-900 font-medium placeholder-slate-400 text-[15px] border border-slate-200/90 rounded-2xl outline-none transition-all duration-200 focus:border-[#163B66] focus:ring-4 focus:ring-[#163B66]/10 shadow-[0_1px_2px_rgba(0,0,0,0.02)]"
                      placeholder="98765 43210"
                    />
                  </div>
                </div>
              )}

              {/* Terms & Conditions / Privacy Policy Checkbox */}
              <div className="pt-1 animate-stagger-3 animate-fade-in text-left">
                <label className="flex items-start gap-2.5 cursor-pointer text-xs text-slate-600 select-none">
                  <input
                    type="checkbox"
                    checked={acceptedTerms}
                    onChange={(e) => {
                      setAcceptedTerms(e.target.checked);
                      if (e.target.checked && termsError) {
                        setTermsError(false);
                      }
                    }}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[#163B66] focus:ring-[#163B66] cursor-pointer"
                  />
                  <span className="leading-relaxed">
                    I agree to the{' '}
                    <Link
                      to="/user/terms"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold text-[#163B66] hover:underline"
                    >
                      Terms & Conditions
                    </Link>{' '}
                    and{' '}
                    <Link
                      to="/user/privacy-policy"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold text-[#163B66] hover:underline"
                    >
                      Privacy Policy
                    </Link>{' '}
                    <span className="text-red-500">*</span>
                  </span>
                </label>
                {termsError && (
                  <p className="text-xs text-red-500 pl-6.5 mt-1 font-medium">
                    Please accept the Terms & Conditions and Privacy Policy to continue
                  </p>
                )}
              </div>

              <div className="animate-stagger-4 animate-fade-in pt-2">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="group relative w-full flex items-center justify-center gap-2 py-3.5 px-4 bg-[#163B66] hover:bg-[#0F2B48] active:scale-[0.98] text-white text-[15px] font-semibold rounded-2xl shadow-[0_6px_20px_rgba(22,59,102,0.22)] hover:shadow-[0_8px_25px_rgba(22,59,102,0.3)] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none disabled:active:scale-100 overflow-hidden"
                >
                  <span className="absolute inset-0 w-full h-full bg-white/10 group-hover:translate-x-full transition-transform duration-700 -translate-x-full" />
                  {isLoading ? (
                    <LogoLoader fullScreen={false} inline={true} size="w-5 h-5" />
                  ) : (
                    <span className="flex items-center gap-2 relative z-10">
                      {verificationToken ? 'Complete Registration' : 'Send OTP'}
                      <FiArrowRight className="group-hover:translate-x-0.5 transition-transform" />
                    </span>
                  )}
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-6">
              <button
                type="button"
                onClick={() => setStep('details')}
                className="flex items-center text-sm font-medium text-slate-500 hover:text-[#163B66] transition-colors mb-2 animate-fade-in active:scale-95"
              >
                <FiChevronLeft className="mr-0.5 text-base" /> Edit details
              </button>

              <form onSubmit={handleOtpSubmit} className="space-y-6">
                <div className="flex justify-center gap-2 sm:gap-2.5 py-2 animate-stagger-1 animate-fade-in">
                  {otp.map((digit, index) => (
                    <input
                      key={index}
                      ref={(el) => (otpInputRefs.current[index] = el)}
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleOtpChange(index, e.target.value)}
                      onKeyDown={(e) => handleOtpKeyDown(index, e)}
                      className="w-11 h-13 sm:w-12 sm:h-14 text-center text-xl sm:text-2xl font-bold text-slate-900 bg-slate-50/70 hover:bg-slate-50 focus:bg-white border border-slate-200/90 rounded-2xl focus:border-[#163B66] focus:ring-4 focus:ring-[#163B66]/10 outline-none transition-all duration-200 shadow-sm active:scale-[0.98]"
                    />
                  ))}
                </div>

                <div className="text-center animate-stagger-2 animate-fade-in">
                  <button
                    type="button"
                    onClick={async () => {
                      if (resendTimer > 0) return;
                      try {
                        const response = await userAuthService.sendOTP(formData.phoneNumber, formData.email || null);
                        if (response.success) {
                          setOtpToken(response.token);
                          setResendTimer(120);
                          toast.success('New code sent!');
                        }
                      } catch (error) {
                        toast.error('Failed to resend code');
                      }
                    }}
                    disabled={resendTimer > 0}
                    className="text-sm font-semibold text-[#163B66] hover:text-[#D68F35] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {resendTimer > 0
                      ? `Resend in ${Math.floor(resendTimer / 60)}:${String(resendTimer % 60).padStart(2, '0')}`
                      : 'Resend code'}
                  </button>
                </div>

                <div className="animate-stagger-3 animate-fade-in pt-1">
                  <button
                    type="submit"
                    disabled={isLoading || otp.join('').length !== 6}
                    className="group relative w-full flex items-center justify-center gap-2 py-3.5 px-4 bg-[#163B66] hover:bg-[#0F2B48] active:scale-[0.98] text-white text-[15px] font-semibold rounded-2xl shadow-[0_6px_20px_rgba(22,59,102,0.22)] hover:shadow-[0_8px_25px_rgba(22,59,102,0.3)] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none disabled:active:scale-100 overflow-hidden"
                  >
                    <span className="absolute inset-0 w-full h-full bg-white/10 group-hover:translate-x-full transition-transform duration-700 -translate-x-full" />
                    {isLoading ? (
                      <LogoLoader fullScreen={false} inline={true} size="w-5 h-5" />
                    ) : (
                      <span className="flex items-center gap-2 relative z-10">
                        Create Account
                        <FiArrowRight className="group-hover:translate-x-0.5 transition-transform" />
                      </span>
                    )}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>

        <p className="mt-6 text-center text-[14px] text-slate-500 animate-fade-in animate-stagger-5">
          Already have an account?{' '}
          <Link to="/user/login" className="font-semibold text-[#163B66] hover:text-[#D68F35] transition-colors duration-200">
            Sign in
          </Link>
        </p>

        {/* Customer Support Link */}
        <div className="mt-4 text-center text-xs text-slate-500 relative z-10 animate-fade-in animate-stagger-5 flex items-center justify-center gap-1.5 flex-wrap">
          <span>Need help creating your account?</span>
          <Link
            to="/user/help-support"
            className="font-semibold text-[#163B66] hover:underline"
          >
            Customer Support
          </Link>
          <span className="text-slate-300">•</span>
          <a
            href="mailto:support@help-u.in"
            className="font-semibold text-[#163B66] hover:underline"
          >
            support@help-u.in
          </a>
        </div>
      </div>

      <div className="w-full text-center py-4 relative z-10 animate-fade-in animate-stagger-5">
        <p className="text-xs text-slate-400 font-normal tracking-wide">
          &copy; {new Date().getFullYear()} Help U. All rights reserved.
        </p>
      </div>
    </div>
  );
};

export default Signup;
