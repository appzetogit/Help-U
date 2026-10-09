import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { FiPhone, FiArrowRight, FiCheckCircle, FiChevronLeft } from 'react-icons/fi';
import { toast } from 'react-hot-toast';
import { themeColors } from '../../../theme';
import { userAuthService } from '../../../services/authService';
import Logo from '../../../components/common/Logo';
import LogoLoader from '../../../components/common/LogoLoader';
import DebugConsole from '../components/common/DebugConsole';

import { z } from "zod";

// Zod schema
const phoneSchema = z.object({
  phone: z.string().regex(/^[6-9]\d{9}$/, "Please enter a valid 10-digit Indian phone number"),
});

const Login = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState('phone'); // 'phone' or 'otp'
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [otpToken, setOtpToken] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);

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

  // Refs for focus management
  const phoneInputRef = useRef(null);
  const otpInputRefs = useRef([]);

  // Auto-focus logic
  useEffect(() => {
    // Redirect if already logged in
    if (localStorage.getItem('accessToken')) {
      navigate('/user', { replace: true });
      return;
    }

    if (step === 'phone' && phoneInputRef.current) {
      setTimeout(() => phoneInputRef.current.focus(), 100);
    } else if (step === 'otp' && otpInputRefs.current[0]) {
      setTimeout(() => otpInputRefs.current[0].focus(), 100);
    }
  }, [step, navigate]);

  const handlePhoneSubmit = async (e) => {
    e.preventDefault();

    // Zod Validation
    const validationResult = phoneSchema.safeParse({ phone: phoneNumber });
    if (!validationResult.success) {
      toast.error(validationResult.error.errors[0].message);
      return;
    }

    setIsLoading(true);
    try {
      // Clean phone number
      const cleanPhone = phoneNumber.replace(/\D/g, '');
      const response = await userAuthService.sendOTP(cleanPhone);

      if (response.success) {
        setOtpToken(response.token);
        setIsLoading(false);
        setStep('otp');
        setResendTimer(120); // Start 2 min timer
        toast.success(
          <div className="flex items-center gap-2">
            <FiCheckCircle className="text-green-500" />
            <span>OTP sent successfully!</span>
          </div>
        );
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
    // Allow only numbers
    if (value && !/^\d+$/.test(value)) return;

    if (value.length > 1) {
      // Handle paste of full OTP
      if (index === 0 && value.length === 6) {
        const chars = value.split('');
        setOtp(chars);
        // Focus the last input or verify button
        otpInputRefs.current[5]?.focus();
        return;
      }
      return;
    }

    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);

    // Auto focus next input
    if (value && index < 5) {
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
      const response = await userAuthService.verifyLogin({
        phone: phoneNumber.replace(/\D/g, ''),
        otp: otpValue
      });

      if (response.success) {
        if (response.isNewUser) {
          toast.success('Phone verified! Please complete your registration.');
          navigate('/user/signup', {
            state: {
              phone: phoneNumber,
              verificationToken: response.verificationToken
            }
          });
        } else {
          toast.success('Welcome back!');
          navigate('/user', { replace: true });
        }
      } else {
        setIsLoading(false);
        toast.error(response.message || 'Verification failed');
      }
    } catch (error) {
      setIsLoading(false);
      toast.error(error.response?.data?.message || 'Verification failed. Please try again.');
    }
  };

  // Brand Colors from theme
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
          {step === 'phone' ? 'Sign in to account' : 'Verify your phone'}
        </h1>
        <p className="mt-1.5 text-[14px] sm:text-[15px] text-slate-500 font-normal leading-relaxed animate-stagger-1 animate-fade-in">
          {step === 'phone'
            ? 'Enter your mobile number to get started'
            : `We've sent a 6-digit code to +91 ${phoneNumber}`
          }
        </p>
      </div>

      <div className="w-full max-w-sm sm:max-w-md mx-auto my-auto relative z-10 py-3">
        <div className="bg-white rounded-3xl border border-slate-100/90 shadow-[0_10px_35px_-5px_rgba(22,59,102,0.06),0_1px_3px_rgba(0,0,0,0.02)] p-6 sm:p-8 relative overflow-hidden animate-slide-in-bottom">
          {/* Refined Brand Gradient Accent Line */}
          <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-[#163B66] via-[#D68F35] to-[#BB5F36]" />

          {step === 'phone' ? (
            <form className="space-y-5" onSubmit={handlePhoneSubmit}>
              <div className="animate-stagger-1 animate-fade-in">
                <label htmlFor="phone" className="block text-[13px] font-semibold text-slate-700 mb-2 tracking-tight">
                  Mobile Number
                </label>
                <div className="relative rounded-2xl group transition-all duration-200">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 group-focus-within:text-[#163B66] transition-colors">
                    <FiPhone className="h-[18px] w-[18px]" />
                  </div>
                  <div className="absolute inset-y-0 left-10 flex items-center pointer-events-none">
                    <span className="text-slate-700 font-semibold text-sm border-r border-slate-200/90 pr-2.5">+91</span>
                  </div>
                  <input
                    ref={phoneInputRef}
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel"
                    id="phone"
                    className="block w-full pl-24 pr-4 py-3.5 bg-slate-50/70 hover:bg-slate-50 focus:bg-white text-slate-900 font-medium placeholder-slate-400 text-[15px] border border-slate-200/90 rounded-2xl outline-none transition-all duration-200 focus:border-[#163B66] focus:ring-4 focus:ring-[#163B66]/10 shadow-[0_1px_2px_rgba(0,0,0,0.02)]"
                    placeholder="98765 43210"
                    value={phoneNumber}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '');
                      if (val.length <= 10) setPhoneNumber(val);
                    }}
                  />
                </div>
              </div>

              <div className="animate-stagger-2 animate-fade-in pt-1">
                <button
                  type="submit"
                  disabled={isLoading || phoneNumber.length < 10}
                  className="group relative w-full flex items-center justify-center gap-2 py-3.5 px-4 bg-[#163B66] hover:bg-[#0F2B48] active:scale-[0.98] text-white text-[15px] font-semibold rounded-2xl shadow-[0_6px_20px_rgba(22,59,102,0.22)] hover:shadow-[0_8px_25px_rgba(22,59,102,0.3)] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none disabled:active:scale-100 overflow-hidden"
                >
                  <span className="absolute inset-0 w-full h-full bg-white/10 group-hover:translate-x-full transition-transform duration-700 -translate-x-full" />
                  {isLoading ? (
                    <LogoLoader fullScreen={false} inline={true} size="w-5 h-5" />
                  ) : (
                    <span className="flex items-center gap-2 relative z-10">
                      Get OTP <FiArrowRight className="group-hover:translate-x-0.5 transition-transform" />
                    </span>
                  )}
                </button>
              </div>

              <div className="pt-2 animate-stagger-3 animate-fade-in">
                <div className="relative my-4">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-slate-100" />
                  </div>
                  <div className="relative flex justify-center">
                    <span className="px-3 bg-white text-xs font-medium text-slate-400">New to Help U?</span>
                  </div>
                </div>

                <Link
                  to="/user/signup"
                  className="w-full flex items-center justify-center py-3.5 px-4 rounded-2xl bg-slate-50/80 hover:bg-slate-100 active:scale-[0.98] text-[15px] font-semibold text-slate-700 hover:text-slate-900 border border-slate-200/80 hover:border-slate-300 shadow-[0_1px_2px_rgba(0,0,0,0.02)] transition-all duration-200"
                >
                  Create an account
                </Link>
              </div>
            </form>
          ) : (
            <form className="space-y-6" onSubmit={handleOtpSubmit}>
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

              <div className="flex items-center justify-between text-sm pt-1 animate-stagger-2 animate-fade-in">
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    setOtp(['', '', '', '', '', '']);
                    setOtpToken('');
                    setStep('phone');
                    setResendTimer(0);
                  }}
                  className="flex items-center text-sm font-medium text-slate-500 hover:text-[#163B66] transition-colors active:scale-95"
                >
                  <FiChevronLeft className="mr-0.5 text-base" /> Change Number
                </button>

                <button
                  type="button"
                  onClick={async () => {
                    if (isLoading || resendTimer > 0) return;
                    try {
                      setIsLoading(true);
                      const response = await userAuthService.sendOTP(phoneNumber.replace(/\D/g, ''));
                      if (response.success) {
                        setOtpToken(response.token);
                        setResendTimer(120);
                        toast.success('OTP resent!');
                      }
                    } catch (err) {
                      toast.error('Error sending OTP');
                    } finally {
                      setIsLoading(false);
                    }
                  }}
                  disabled={isLoading || resendTimer > 0}
                  className="text-sm font-semibold text-[#163B66] hover:text-[#D68F35] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {resendTimer > 0
                    ? `Resend in ${Math.floor(resendTimer / 60)}:${String(resendTimer % 60).padStart(2, '0')}`
                    : 'Resend OTP'}
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
                      Verify & Continue <FiArrowRight className="group-hover:translate-x-0.5 transition-transform" />
                    </span>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      <div className="w-full text-center py-4 relative z-10 animate-fade-in animate-stagger-4">
        <p className="text-xs text-slate-400 font-normal tracking-wide">
          &copy; {new Date().getFullYear()} Help U. All rights reserved.
        </p>
      </div>
      <DebugConsole />
    </div>
  );
};

export default Login;
