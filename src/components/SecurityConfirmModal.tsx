import React, { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Shield, X, Loader2, AlertCircle } from 'lucide-react';
import { handleFirestoreError, OperationType } from '../utils/errorHandlers';

interface SecurityConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
}

export default function SecurityConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  description
}: SecurityConfirmModalProps) {
  const [inputCode, setInputCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [correctCode, setCorrectCode] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setInputCode('');
      setError('');
      setLoading(true);
      
      const fetchSecurityCode = async () => {
        try {
          const docSnap = await getDoc(doc(db, 'settings', 'global'));
          if (docSnap.exists()) {
            const data = docSnap.data();
            setCorrectCode(data.reset_password || null);
          }
        } catch (err) {
          handleFirestoreError(err, OperationType.GET, 'settings/global');
        } finally {
          setLoading(false);
        }
      };

      fetchSecurityCode();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (loading) return;

    if (!correctCode) {
      setError('لم يتم تعيين كلمة المرور الموحدة بعد من قبل السوبر أدمن.');
      return;
    }

    if (inputCode !== correctCode) {
      setError('كلمة المرور الموحدة غير صحيحة!');
      return;
    }

    setError('');
    onConfirm();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <div className="flex items-center gap-2">
            <Shield className="text-indigo-600" size={20} />
            <h2 className="text-lg font-bold text-slate-900">{title}</h2>
          </div>
          <button 
            onClick={onClose} 
            className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X size={20} />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <p className="text-sm text-slate-500 leading-relaxed text-right">{description}</p>
          
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-500 mr-1 text-right">أدخل كلمة المرور الموحدة</label>
            <div className="relative">
              <Shield size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="password"
                required
                placeholder="••••"
                value={inputCode}
                onChange={(e) => {
                  setInputCode(e.target.value);
                  setError('');
                }}
                disabled={loading}
                className={`w-full pr-12 pl-4 py-3 bg-slate-50 border rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none text-center font-mono tracking-widest text-lg transition-all ${
                  error ? 'border-red-500 focus:ring-red-500' : 'border-slate-200'
                }`}
              />
            </div>
            {error && (
              <div className="flex items-center gap-1.5 text-red-500 text-xs mt-1 mr-1 justify-start">
                <AlertCircle size={14} />
                <span>{error}</span>
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <button 
              type="submit" 
              disabled={loading}
              className="flex-1 bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading && <Loader2 size={16} className="animate-spin" />}
              <span>تأكيد العملية</span>
            </button>
            <button 
              type="button" 
              onClick={onClose} 
              className="flex-1 bg-slate-100 text-slate-600 py-3 rounded-xl font-bold hover:bg-slate-200 transition-colors"
            >
              إلغاء
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
