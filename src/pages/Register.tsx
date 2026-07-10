import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createUserWithEmailAndPassword, sendEmailVerification } from 'firebase/auth';
import { doc, setDoc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { UserPlus, Mail, Lock, User, Phone, IdCard, Building, AlertCircle, Camera, Image as ImageIcon, CheckCircle, ChevronDown } from 'lucide-react';
import { uploadToCloudinary } from '../utils/cloudinary';
import { Logo } from '../components/Logo';
import { DeveloperFooter } from '../components/DeveloperFooter';
import { useAuth } from '../contexts/AuthContext';

export default function Register() {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    phone: '',
    university_id: '',
    department: '',
    requested_role: 'student' as 'student' | 'admin',
    observer_type: 'طالب دراسات' as 'طالب دراسات' | 'موظف' | 'أمين قاعة' | 'دكتور مشرف',
    activation_code: '',
  });

  // Redirect if already logged in
  useEffect(() => {
    if (user) {
      if (isAdmin) {
        navigate('/admin', { replace: true });
      } else {
        navigate('/dashboard', { replace: true });
      }
    }
  }, [user, isAdmin, navigate]);

  const [profileImage, setProfileImage] = useState<File | null>(null);
  const [idCardImage, setIdCardImage] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [isEmailInUse, setIsEmailInUse] = useState(false);
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [isInIframe, setIsInIframe] = useState(false);

  const [globalSettings, setGlobalSettings] = useState<any>(null);

  useEffect(() => {
    try {
      setIsInIframe(window.self !== window.top);
    } catch (e) {
      setIsInIframe(true);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'settings', 'global'), (docSnap) => {
      if (docSnap.exists()) {
        setGlobalSettings(docSnap.data());
      }
    });
    return () => unsubscribe();
  }, []);

  const isLocked = globalSettings?.profiles_locked === true;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isLocked) return;
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsEmailInUse(false);
    setSuccess('');

    const arabicRegex = /^[\u0600-\u06FF\s]+$/;
    if (!arabicRegex.test(formData.name.trim())) {
      setError('يجب كتابة الاسم باللغة العربية حصراً');
      return;
    }

    if (formData.password.length < 6) {
      setError('يجب أن تكون كلمة المرور 6 أحرف على الأقل');
      return;
    }

    if (!profileImage) {
      setError('الصورة الشخصية مطلوبة لإتمام عملية التسجيل.');
      return;
    }

    if (!idCardImage) {
      setError('صورة البطاقة الجامعية أو الوظيفية مطلوبة لإتمام عملية التسجيل.');
      return;
    }

    const expectedCode = (globalSettings?.security_code || '').trim();
    const enteredCode = (formData.activation_code || '').trim();
    if (!enteredCode || enteredCode !== expectedCode) {
      setError('كود تفعيل حساب المشرف غير صحيح. يرجى الحصول عليه من إدارة الكلية لتتمكن من إنشاء الحساب.');
      return;
    }

    setLoading(true);
    await completeRegistration();
  };

  const completeRegistration = async () => {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, formData.email, formData.password);
      const user = userCredential.user;

      // Send verification email
      await sendEmailVerification(user);

      let profileImageUrl = '';
      let idCardImageUrl = '';

      if (profileImage) {
        try {
          profileImageUrl = await uploadToCloudinary(profileImage);
        } catch (err) {
          console.error('Profile image upload failed:', err);
        }
      }

      if (idCardImage) {
        try {
          idCardImageUrl = await uploadToCloudinary(idCardImage);
        } catch (err) {
          console.error('ID card image upload failed:', err);
        }
      }

      await setDoc(doc(db, 'users', user.uid), {
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        university_id: formData.university_id,
        department: formData.department,
        role: 'student',
        requested_role: formData.requested_role,
        status: 'pending',
        profile_image_url: profileImageUrl,
        id_card_image_url: idCardImageUrl,
        admin_note: '',
        student_note: '',
        required_hours: 16, // Default
        observer_type: formData.requested_role === 'student' ? formData.observer_type : 'طالب دراسات',
        createdAt: new Date().toISOString(),
        email_verified: false,
      });

      setSuccess('تم إنشاء الحساب بنجاح! تم إرسال رابط التحقق إلى بريدك الإلكتروني. يرجى تفعيل الحساب قبل تسجيل الدخول.');
      setTimeout(() => navigate('/login'), 6000);
    } catch (err: any) {
      console.warn('Registration error details:', err.message || err);
      const errorCode = err.code || '';
      const errorMessage = err.message || '';
      const fullError = (typeof err === 'string' ? err : (errorMessage + ' ' + errorCode)).toLowerCase();
      
      if (fullError.includes('email-already-in-use')) {
        setError('هذا البريد الإلكتروني مسجل لدينا بالفعل.');
        setIsEmailInUse(true);
      } else if (fullError.includes('network-request-failed')) {
        setError('فشل الاتصال بـ Firebase (Network Request Failed). يحدث هذا عادةً بسبب قيود متصفحك على الإطارات الداخلية (Iframe)، أو مانع الإعلانات، أو حظر ملفات تعريف الارتباط للجهات الخارجية (Third-party cookies). لحل المشكلة فوراً، يرجى الضغط على زر "فتح في نافذة جديدة" بالأعلى لإتمام عملية التسجيل بنجاح.');
      } else if (fullError.includes('internal-error')) {
        setError('حدث خطأ داخلي في الخادم. يرجى التأكد من اتصالك بالإنترنت والمحاولة مرة أخرى.');
      } else {
        setError('حدث خطأ أثناء إنشاء الحساب. يرجى المحاولة مرة أخرى.');
      }
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4 py-12">
      <div className="max-w-2xl w-full bg-white rounded-3xl shadow-xl p-8">
        <div className="flex flex-col items-center mb-8">
          <Logo className="w-16 h-16" showText={false} />
          <h1 className="text-3xl font-bold text-indigo-600 mt-4">إنشاء حساب جديد</h1>
          <p className="text-slate-500 mt-2 text-center">انضم إلى نظام المراقبات الامتحانية كمراقب</p>
          <p className="text-xs text-slate-400 mt-1">جامعة دمشق كلية الهندسة المعمارية</p>
        </div>

        {isInIframe && (
          <div className="mb-6 p-4 bg-indigo-50 border border-indigo-100 rounded-2xl text-right animate-pulse">
            <p className="text-xs text-indigo-900 leading-relaxed font-bold">
              💡 لتجنب أخطاء التسجيل والشبكة (مثل حظر ملفات تعريف الارتباط في الإطار الداخلي)، يرجى فتح التطبيق في نافذة مستقلة كاملة:
            </p>
            <a 
              href={window.location.href} 
              target="_blank" 
              rel="noopener noreferrer" 
              className="mt-2.5 inline-flex items-center gap-1.5 bg-indigo-600 text-white text-[11px] font-bold px-4 py-2 rounded-xl hover:bg-indigo-700 transition-all shadow-md shadow-indigo-150"
            >
              <span>فتح في نافذة جديدة ↗</span>
            </a>
          </div>
        )}

        {error && (
          <div className="mb-6 p-4 bg-red-50 text-red-600 rounded-2xl flex flex-col gap-3 text-sm">
            <div className="flex items-center gap-3">
              <AlertCircle size={18} />
              <span>{error}</span>
            </div>
            {isEmailInUse && (
              <div className="flex flex-col gap-2 mt-2 pt-3 border-t border-red-100">
                <Link to="/forgot-password" className="text-indigo-600 font-bold hover:underline flex items-center gap-1">
                  هل نسيت كلمة المرور؟
                </Link>
                <Link to="/login" className="text-indigo-600 font-bold hover:underline flex items-center gap-1">
                  الذهاب لتسجيل الدخول
                </Link>
              </div>
            )}
          </div>
        )}

        {success && (
          <div className="mb-6 p-4 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center gap-3 text-sm">
            <CheckCircle size={18} />
            <span>{success}</span>
          </div>
        )}

        {!success ? (
          <div className="space-y-6">
            {isLocked && (
              <div className="p-4 bg-amber-50 text-amber-900 border border-amber-200 rounded-2xl flex items-start gap-3 text-sm animate-fade-in">
                <div className="p-1.5 bg-white rounded-lg text-amber-600 shadow-sm border border-amber-100">
                  <Lock size={18} />
                </div>
                <div>
                  <span className="font-bold block text-amber-800">التسجيل وتعديل البيانات مغلق</span>
                  <p className="mt-1">تم إغلاق تعديل البيانات من قبل الإدارة لاعتماد الحسابات</p>
                </div>
              </div>
            )}
            
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">الاسم الكامل</label>
                  <div className="relative">
                    <User className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                    <input
                      name="name"
                      type="text"
                      required
                      disabled={isLocked}
                      value={formData.name}
                      onChange={handleChange}
                      className="w-full pr-12 pl-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                      placeholder="الاسم الثلاثي"
                    />
                  </div>
                </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">البريد الإلكتروني</label>
                <div className="relative">
                  <Mail className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                  <input
                    name="email"
                    type="email"
                    required
                    disabled={isLocked}
                    value={formData.email}
                    onChange={handleChange}
                    className="w-full pr-12 pl-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                    placeholder="example@univ.edu"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">كلمة المرور</label>
                <div className="relative">
                  <Lock className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                  <input
                    name="password"
                    type="password"
                    required
                    disabled={isLocked}
                    minLength={6}
                    value={formData.password}
                    onChange={handleChange}
                    className="w-full pr-12 pl-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                    placeholder="••••••••"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">رقم الهاتف</label>
                <div className="relative">
                  <Phone className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                  <input
                    name="phone"
                    type="tel"
                    required
                    disabled={isLocked}
                    value={formData.phone}
                    onChange={handleChange}
                    className="w-full pr-12 pl-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                    placeholder="05xxxxxxxx"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">الرقم الجامعي</label>
                <div className="relative">
                  <IdCard className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                  <input
                    name="university_id"
                    type="text"
                    required
                    disabled={isLocked}
                    value={formData.university_id}
                    onChange={handleChange}
                    className="w-full pr-12 pl-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                    placeholder="2024xxxx"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">القسم / التخصص</label>
                <div className="relative">
                  <Building className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                  <input
                    name="department"
                    type="text"
                    required
                    disabled={isLocked}
                    value={formData.department}
                    onChange={handleChange}
                    className="w-full pr-12 pl-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                    placeholder="علوم الحاسب"
                  />
                </div>
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-2">كود تفعيل حساب المشرف / المراقب</label>
                <div className="relative">
                  <Lock className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                  <input
                    name="activation_code"
                    type="text"
                    required
                    disabled={isLocked}
                    value={formData.activation_code}
                    onChange={handleChange}
                    className="w-full pr-12 pl-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all disabled:opacity-60 disabled:cursor-not-allowed font-sans"
                    placeholder="أدخل كود التفعيل المعتمد من قبل الإدارة..."
                  />
                </div>
                <p className="text-xs text-slate-400 mt-1">يجب الحصول على هذا الكود من إدارة الكلية لتفعيل وإتمام عملية تسجيل حسابك.</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">نوع الحساب المطلوب</label>
                <div className="grid grid-cols-2 gap-4">
                  <button
                    type="button"
                    disabled={isLocked}
                    onClick={() => setFormData({ ...formData, requested_role: 'student' })}
                    className={`py-3 px-4 rounded-2xl border-2 transition-all font-bold text-sm ${
                      formData.requested_role === 'student'
                        ? 'border-indigo-600 bg-indigo-50 text-indigo-600'
                        : 'border-slate-100 bg-slate-50 text-slate-500 hover:border-slate-200'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    مراقب
                  </button>
                  <button
                    type="button"
                    disabled={isLocked}
                    onClick={() => setFormData({ ...formData, requested_role: 'admin' })}
                    className={`py-3 px-4 rounded-2xl border-2 transition-all font-bold text-sm ${
                      formData.requested_role === 'admin'
                        ? 'border-indigo-600 bg-indigo-50 text-indigo-600'
                        : 'border-slate-100 bg-slate-50 text-slate-500 hover:border-slate-200'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    مدير
                  </button>
                </div>
              </div>

              {formData.requested_role === 'student' && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">صفة المراقب</label>
                  <div className="relative">
                    <select
                      name="observer_type"
                      disabled={isLocked}
                      value={formData.observer_type}
                      onChange={(e) => setFormData({ ...formData, observer_type: e.target.value as any })}
                      className="w-full pr-4 pl-10 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all appearance-none text-slate-700 font-bold text-sm text-right disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      <option value="طالب دراسات">طالب دراسات</option>
                      <option value="موظف">موظف</option>
                      <option value="أمين قاعة">أمين قاعة</option>
                      <option value="دكتور مشرف">دكتور مشرف</option>
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-slate-400">
                      <ChevronDown size={18} />
                    </div>
                  </div>
                </div>
              )}

              <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-slate-100">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">الصورة الشخصية (إجباري)</label>
                  <label className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-slate-200 rounded-2xl transition-all overflow-hidden relative ${isLocked ? 'cursor-not-allowed opacity-50 bg-slate-100' : 'cursor-pointer hover:bg-slate-50'}`}>
                    {profileImage ? (
                      <div className="flex flex-col items-center">
                        <CheckCircle size={24} className="text-emerald-500 mb-1" />
                        <span className="text-xs text-slate-500 px-2 text-center truncate w-full">{profileImage.name}</span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center">
                        <Camera size={24} className="text-slate-400 mb-1" />
                        <span className="text-xs text-slate-400">اختر صورة</span>
                      </div>
                    )}
                    <input type="file" className="hidden" accept="image/*" disabled={isLocked} onChange={(e) => setProfileImage(e.target.files?.[0] || null)} />
                  </label>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">صورة البطاقة الجامعية أو الوظيفية (إجباري)</label>
                  <label className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-slate-200 rounded-2xl transition-all overflow-hidden relative ${isLocked ? 'cursor-not-allowed opacity-50 bg-slate-100' : 'cursor-pointer hover:bg-slate-50'}`}>
                    {idCardImage ? (
                      <div className="flex flex-col items-center">
                        <CheckCircle size={24} className="text-emerald-500 mb-1" />
                        <span className="text-xs text-slate-500 px-2 text-center truncate w-full">{idCardImage.name}</span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center">
                        <ImageIcon size={24} className="text-slate-400 mb-1" />
                        <span className="text-xs text-slate-400">اختر صورة</span>
                      </div>
                    )}
                    <input type="file" className="hidden" accept="image/*" disabled={isLocked} onChange={(e) => setIdCardImage(e.target.files?.[0] || null)} />
                  </label>
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || isLocked}
              className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-bold hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <UserPlus size={20} />
                  <span>إنشاء الحساب</span>
                </>
              )}
            </button>
          </form>
          </div>
        ) : (
          <div className="text-center py-8">
            <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle size={32} />
            </div>
            <h2 className="text-xl font-bold text-slate-800 mb-2">تم التسجيل بنجاح!</h2>
            <p className="text-slate-600">يرجى التحقق من بريدك الإلكتروني لتفعيل الحساب قبل تسجيل الدخول.</p>
            <Link to="/login" className="mt-6 inline-block text-indigo-600 font-bold hover:underline">
              العودة لتسجيل الدخول
            </Link>
          </div>
        )}

        <p className="mt-8 text-center text-slate-600">
          لديك حساب بالفعل؟{' '}
          <Link to="/login" className="text-indigo-600 font-bold hover:underline">
            تسجيل الدخول
          </Link>
        </p>

        <DeveloperFooter className="mt-8 pt-6 border-t" />
      </div>
    </div>
  );
}
