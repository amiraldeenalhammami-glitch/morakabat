import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      let errorMessage = 'حدث خطأ غير متوقع في النظام.';
      let isFirestoreError = false;

      try {
        if (this.state.error?.message) {
          const parsed = JSON.parse(this.state.error.message);
          if (parsed.error && parsed.operationType) {
            isFirestoreError = true;
            if (parsed.error.includes('insufficient permissions')) {
              errorMessage = 'عذراً، ليس لديك الصلاحيات الكافية للقيام بهذا الإجراء.';
            } else if (parsed.error.includes('client is offline')) {
              errorMessage = 'يبدو أنك غير متصل بالإنترنت، يرجى التحقق من اتصالك.';
            } else {
              errorMessage = `خطأ في قاعدة البيانات: ${parsed.error}`;
            }
          }
        }
      } catch (e) {
        // Not a JSON error message, use default
      }

      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 font-sans" dir="rtl">
          <div className="max-w-md w-full bg-white rounded-3xl shadow-xl border border-slate-100 p-8 text-center">
            <div className="w-20 h-20 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertCircle size={40} />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mb-2">عذراً، حدث خطأ ما</h1>
            <p className="text-slate-500 mb-8 leading-relaxed">
              {errorMessage}
            </p>
            <button
              onClick={this.handleReset}
              className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-bold hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-200"
            >
              <RefreshCw size={20} />
              <span>إعادة تحميل الصفحة</span>
            </button>
            {isFirestoreError && (
              <p className="mt-6 text-[10px] text-slate-400 font-mono break-all opacity-50">
                {this.state.error?.message}
              </p>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
