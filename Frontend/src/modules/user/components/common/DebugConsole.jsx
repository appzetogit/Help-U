import React, { useState, useEffect } from 'react';
import { FiTerminal, FiX, FiAlertCircle, FiClipboard, FiTrash2 } from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';

const DebugConsole = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [logs, setLogs] = useState([]);
  const [errors, setErrors] = useState([]);

  useEffect(() => {
    // Intercept console.error
    const originalError = console.error;
    console.error = (...args) => {
      setErrors(prev => [...prev.slice(-19), { 
        id: Date.now(), 
        message: args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '),
        time: new Date().toLocaleTimeString()
      }]);
      originalError.apply(console, args);
    };

    // Capture global errors
    const handleGlobalError = (event) => {
      setErrors(prev => [...prev.slice(-19), { 
        id: Date.now(), 
        message: `Global Error: ${event.message}`,
        time: new Date().toLocaleTimeString()
      }]);
    };

    window.addEventListener('error', handleGlobalError);
    return () => {
      console.error = originalError;
      window.removeEventListener('error', handleGlobalError);
    };
  }, []);

  if (import.meta.env.MODE === 'production' && !window.location.search.includes('debug=true')) {
    return null;
  }

  return (
    <>
      {/* Draggable/Fixed Toggle Button */}
      <motion.button
        drag
        dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
        onClick={() => setIsOpen(true)}
        className="fixed bottom-32 right-6 z-[9999] w-12 h-12 bg-gray-900 text-white rounded-full flex items-center justify-center shadow-2xl border-2 border-white/20 active:scale-90"
        title="Open Debug Console"
      >
        <FiTerminal size={20} />
        {errors.length > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-[10px] flex items-center justify-center font-bold">
            {errors.length}
          </span>
        )}
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 100 }}
            className="fixed inset-x-0 bottom-0 z-[10000] h-[60vh] bg-gray-900 text-gray-100 shadow-2xl rounded-t-[32px] flex flex-col overflow-hidden border-t-4 border-teal-500"
          >
            <div className="flex items-center justify-between p-6 border-b border-gray-800 bg-gray-900/50 backdrop-blur-xl">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-teal-500/20 rounded-lg">
                  <FiTerminal className="text-teal-400" />
                </div>
                <h3 className="font-bold text-lg">Help U Debug Console</h3>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setErrors([])}
                  className="p-2 hover:bg-white/10 rounded-lg text-gray-400 transition-colors"
                  title="Clear Logs"
                >
                  <FiTrash2 size={18} />
                </button>
                <button 
                  onClick={() => setIsOpen(false)}
                  className="p-2 hover:bg-white/10 rounded-lg text-gray-400 transition-colors"
                >
                  <FiX size={20} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-4 font-mono text-xs space-y-3">
              {errors.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-gray-500 gap-4 opacity-50">
                  <FiAlertCircle size={40} />
                  <p>No critical errors detected. Everything looks good!</p>
                </div>
              ) : (
                errors.map(err => (
                  <div key={err.id} className="p-3 bg-red-900/20 border-l-4 border-red-500/50 rounded-r-lg group">
                    <div className="flex justify-between items-start mb-1">
                      <span className="text-[10px] text-red-400 font-bold uppercase tracking-wider">Error @ {err.time}</span>
                      <button 
                        onClick={() => navigator.clipboard.writeText(err.message)}
                        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-white/10 rounded transition-all"
                      >
                        <FiClipboard size={12} />
                      </button>
                    </div>
                    <p className="text-red-200 break-words leading-relaxed">{err.message}</p>
                  </div>
                ))
              )}
            </div>

            <div className="p-4 bg-gray-950/50 border-t border-gray-800 text-[10px] text-gray-500 flex justify-between items-center">
              <span>Environment: {import.meta.env.MODE || 'unknown'}</span>
              <span>Help U Frontend Debugger v1.0</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default DebugConsole;
