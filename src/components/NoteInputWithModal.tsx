import React, { useState, useEffect, useRef } from 'react';
import { Maximize2, Save, X, MessageSquare, Loader2 } from 'lucide-react';

interface NoteInputWithModalProps {
  initialValue: string;
  onSave: (value: string) => Promise<void> | void;
  placeholder?: string;
  label?: string;
  className?: string;
  inputClassName?: string;
  rows?: number;
}

export default function NoteInputWithModal({
  initialValue,
  onSave,
  placeholder = "اكتب ملاحظة...",
  label = "تعديل الملاحظة",
  className = "",
  inputClassName = "",
  rows = 2
}: NoteInputWithModalProps) {
  const [value, setValue] = useState(initialValue);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalValue, setModalValue] = useState(initialValue);
  const [isSaving, setIsSaving] = useState(false);
  const [isInlineSaving, setIsInlineSaving] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  // Synchronize modal value when opening
  const handleOpenModal = () => {
    setModalValue(value);
    setIsModalOpen(true);
  };

  const handleInlineSave = async (val: string) => {
    if (val === initialValue) return;
    setIsInlineSaving(true);
    try {
      await onSave(val);
    } catch (err) {
      console.error("Failed to save inline note:", err);
    } finally {
      setIsInlineSaving(false);
    }
  };

  const handleModalSave = async () => {
    setIsSaving(true);
    try {
      await onSave(modalValue);
      setValue(modalValue);
      setIsModalOpen(false);
    } catch (err) {
      console.error("Failed to save modal note:", err);
    } finally {
      setIsSaving(false);
    }
  };

  // Close on ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isModalOpen) {
        setIsModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isModalOpen]);

  return (
    <div className={`relative flex flex-col w-full ${className}`}>
      <div className="relative flex items-stretch gap-1 w-full group">
        <textarea
          rows={rows}
          placeholder={placeholder}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => handleInlineSave(value)}
          className={`w-full text-xs bg-slate-50 border border-slate-200 rounded-xl pr-3 pl-10 py-2 focus:ring-2 focus:ring-indigo-500 outline-none leading-relaxed resize-y transition-all ${inputClassName}`}
        />
        <button
          type="button"
          onClick={handleOpenModal}
          title="تعديل في نافذة منبثقة مكبرة"
          className="absolute left-2 bottom-2 p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
        >
          <Maximize2 size={13} />
        </button>
        {isInlineSaving && (
          <div className="absolute left-8 bottom-3">
            <Loader2 size={12} className="animate-spin text-indigo-600" />
          </div>
        )}
      </div>

      {/* Modern Pop-up Modal Dialog */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
          <div
            ref={modalRef}
            className="w-full max-w-xl bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden transform transition-all duration-300 scale-100 flex flex-col"
            style={{ direction: 'rtl' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 bg-slate-50/50">
              <div className="flex items-center gap-2.5 text-slate-800">
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                  <MessageSquare size={18} />
                </div>
                <h3 className="text-base font-bold text-slate-950">{label}</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 flex-1 flex flex-col gap-4">
              <label className="text-xs font-bold text-slate-500">محتوى الملاحظة:</label>
              <textarea
                rows={6}
                value={modalValue}
                onChange={(e) => setModalValue(e.target.value)}
                placeholder={placeholder}
                className="w-full text-sm bg-slate-50 border border-slate-200 rounded-2xl p-4 focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none leading-relaxed resize-none shadow-inner transition-all"
                autoFocus
              />
              <div className="flex justify-between items-center text-xs text-slate-400">
                <span>طول النص: {modalValue.length} حرفاً</span>
                <span>يمكنك استخدام أسطر متعددة للترتيب</span>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50/50">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-5 py-2.5 text-sm font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleModalSave}
                disabled={isSaving}
                className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 disabled:opacity-50"
              >
                {isSaving ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Save size={16} />
                )}
                <span>حفظ التعديلات</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
