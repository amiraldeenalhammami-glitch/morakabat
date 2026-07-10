import React from 'react';
import { Eye } from 'lucide-react';
import PublicLanding from './PublicLanding';

export default function AdminPreview() {
  return (
    <div className="space-y-6 text-right animate-in fade-in duration-250" dir="rtl">
      <div className="bg-white border border-slate-100 p-6 rounded-3xl shadow-sm">
        <h1 className="text-2xl font-black text-slate-900 flex items-center justify-start gap-2 flex-row-reverse">
          <Eye className="text-indigo-600" size={24} />
          <span>المعاينة الذكية للواجهة العامة</span>
        </h1>
        <p className="text-xs text-slate-500 mt-2">
          معاينة حية ومباشرة للواجهة العامة بنفس طريقة تصفح الطلاب والعموم، لرصد توزيع القاعات والنتائج بدقة متناهية ودون الحاجة لتسجيل الخروج.
        </p>
      </div>

      <div className="border-4 border-dashed border-indigo-100 rounded-3xl overflow-hidden bg-slate-50">
        <PublicLanding isPreview={true} />
      </div>
    </div>
  );
}
