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

  public componentDidMount() {
    window.addEventListener('error', this.handleGlobalError);
    window.addEventListener('unhandledrejection', this.handleGlobalRejection);
  }

  public componentWillUnmount() {
    window.removeEventListener('error', this.handleGlobalError);
    window.removeEventListener('unhandledrejection', this.handleGlobalRejection);
  }

  private handleGlobalError = (event: ErrorEvent) => {
    if (event.error) {
      this.setState({ hasError: true, error: event.error });
    } else if (event.message) {
      this.setState({ hasError: true, error: new Error(event.message) });
    }
  };

  private handleGlobalRejection = (event: PromiseRejectionEvent) => {
    const reason = event.reason;
    const errorInstance = reason instanceof Error ? reason : new Error(String(reason));
    this.setState({ hasError: true, error: errorInstance });
  };

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
      let isQuotaError = false;

      try {
        if (this.state.error?.message) {
          const rawMessage = this.state.error.message;
          const isQuotaRaw = rawMessage.toLowerCase().includes('quota') || rawMessage.includes('الحد الأقصى') || rawMessage.includes('limit exceeded') || rawMessage.includes('resource exhausted');
          
          let parsed: any = null;
          try {
            parsed = JSON.parse(rawMessage);
          } catch (e) {
            // Not a JSON
          }

          if (parsed && parsed.error && parsed.operationType) {
            isFirestoreError = true;
            const errorText = String(parsed.error).toLowerCase();
            if (errorText.includes('insufficient permissions')) {
              errorMessage = 'عذراً، ليس لديك الصلاحيات الكافية للقيام بهذا الإجراء.';
            } else if (errorText.includes('client is offline')) {
              errorMessage = 'يبدو أنك غير متصل بالإنترنت، يرجى التحقق من اتصالك.';
            } else if (errorText.includes('quota') || errorText.includes('limit exceeded') || errorText.includes('resource exhausted')) {
              isQuotaError = true;
            } else {
              errorMessage = `خطأ في قاعدة البيانات: ${parsed.error}`;
            }
          } else if (isQuotaRaw) {
            isFirestoreError = true;
            isQuotaError = true;
          }
        }
      } catch (e) {
        // Fallback
      }

      if (isQuotaError) {
        return (
          <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 font-sans" dir="rtl">
            <div className="max-w-md w-full bg-white rounded-3xl shadow-xl border border-slate-100 p-8 text-center animate-in fade-in zoom-in-95 duration-250">
              <div className="w-20 h-20 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-6">
                <AlertCircle size={40} />
              </div>
              <h1 className="text-2xl font-bold text-slate-900 mb-4 leading-snug">عذراً، النظام تحت وضع جدولة الطلبات المؤقت</h1>
              <p className="text-slate-500 mb-6 leading-relaxed text-sm text-justify">
                نظرًا للإقبال الكثيف والتزامن العالي من الطلاب لإنشاء الحسابات وتحديث البيانات خلال فترة الإطلاق التجريبي الحالية، تم تفعيل نظام الجدولة التلقائية لحماية البيانات وضمان استقرار السيرفر.
              </p>
              <p className="text-slate-500 mb-6 leading-relaxed text-sm text-justify">
                يُرجى العلم أن هذه نافذة صيانة تنظيمية مؤقتة ومحدودة، وستعود المنصة لاستقبال طلبات التسجيل بشكل كامل وطبيعي خلال الساعات القادمة.
              </p>
              <div className="p-4 bg-amber-50 border border-amber-100 rounded-xl mb-6 text-right">
                <p className="text-xs text-amber-800 leading-relaxed font-medium">
                  💡 تنويه: يتم الآن إنهاء عمليات الفحص والتهيئة النهائية للسيرفرات لاستيعاب الضغط المتزايد. يمكنك الضغط على الزر أدناه للتحقق من فتح نافذة الدخول مجدداً.
                </p>
              </div>
              <button
                onClick={this.handleReset}
                className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-bold hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-200"
              >
                <RefreshCw size={20} />
                <span>التحقق من الدخول مجدداً</span>
              </button>
            </div>
          </div>
        );
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
