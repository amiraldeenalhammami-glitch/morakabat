import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { doc, onSnapshot, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { ExamSlot, AppSettings } from '../types';
import { DeveloperFooter } from '../components/DeveloperFooter';
import { 
  Calendar, Clock, MapPin, Search, ChevronDown, ChevronUp, Lock, 
  LogIn, LayoutDashboard, SearchCode, AlertTriangle, HelpCircle, RefreshCw, X,
  Trophy, Award, Check, Star, Info, TrendingUp, Sparkles, BookOpen
} from 'lucide-react';

const academicYearsList = [1, 2, 3, 4, 5, 6, 7];
const yearNames = ['الأولى', 'الثانية', 'الثالثة', 'الرابعة', 'الخامسة', 'ماجستير أكاديمي', 'ماجستير تأهيل وتخصص'];

export default function PublicLanding({ isPreview = false }: { isPreview?: boolean }) {
  const { user, isAdmin, isExamOfficer } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Route Guard: Logged-in users should be redirected to their dashboards and prevented from accessing /
  useEffect(() => {
    if (isPreview) return; // Skip redirect if in preview mode
    if (user && location.pathname === '/') {
      if (isAdmin) {
        navigate('/admin', { replace: true });
      } else if (isExamOfficer) {
        navigate('/officer', { replace: true });
      } else {
        navigate('/dashboard', { replace: true });
      }
    }
  }, [user, isAdmin, isExamOfficer, navigate, location.pathname, isPreview]);
  
  // App settings state
  const [globalSettings, setGlobalSettings] = useState<AppSettings | null>(null);
  const [scheduleSlots, setScheduleSlots] = useState<ExamSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingSchedule, setLoadingSchedule] = useState(false);
  
  // Active View Tab State ('schedule' or 'results')
  const [activeView, setActiveView] = useState<'schedule' | 'results'>('schedule');

  // UI Accordion State
  const [expandedYear, setExpandedYear] = useState<number | null>(null);
  const [expandedResultsYear, setExpandedResultsYear] = useState<number | null>(null);
  
  // Active modal/popup for viewing student-to-room distribution
  const [activeSlotForDistribution, setActiveSlotForDistribution] = useState<ExamSlot | null>(null);
  const [distributionList, setDistributionList] = useState<{ student_name: string; room: string; exam_number?: string }[]>([]);
  const [loadingDistribution, setLoadingDistribution] = useState(false);
  const [searchStudentQuery, setSearchStudentQuery] = useState('');

  // Results Tab States
  const [activeSubjectForResults, setActiveSubjectForResults] = useState<ExamSlot | null>(null);
  const [searchResultStudentQuery, setSearchResultStudentQuery] = useState('');
  const [sortResultsTopStudents, setSortResultsTopStudents] = useState(false);

  // 1. Subscribe to global settings in real-time
  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'settings', 'global'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as AppSettings;
        setGlobalSettings(data);
        
        // Auto-set the active view based on what is published
        if (data.show_public_schedule) {
          setActiveView('schedule');
        } else if (data.show_public_results) {
          setActiveView('results');
        } else if (isPreview) {
          setActiveView('schedule');
        }
      }
      setLoading(false);
    }, (err) => {
      console.error("Error loading global settings:", err);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [isPreview]);

  // 2. Fetch or load cached public schedule when settings change (schedule OR results are visible)
  useEffect(() => {
    if (!globalSettings) return;

    const showPublic = isPreview || globalSettings.show_public_schedule === true || globalSettings.show_public_results === true;
    if (!showPublic) {
      setScheduleSlots([]);
      setLoadingSchedule(false);
      return;
    }

    const currentVersion = globalSettings.global_settings_version || 0;
    const cachedVersionStr = localStorage.getItem('public_schedule_version');
    const cachedSlotsStr = localStorage.getItem('public_schedule_cache');

    if (!isPreview && cachedVersionStr && cachedSlotsStr && parseInt(cachedVersionStr) === currentVersion) {
      try {
        setScheduleSlots(JSON.parse(cachedSlotsStr));
        setLoadingSchedule(false);
        return;
      } catch (e) {
        console.warn("Failed to parse cached schedule, fetching fresh:", e);
      }
    }

    // Fetch fresh aggregated schedule
    const loadAggregatedSchedule = async () => {
      setLoadingSchedule(true);
      try {
        const docSnap = await getDoc(doc(db, 'publicSchedule', 'current'));
        if (docSnap.exists()) {
          const data = docSnap.data();
          const slots = data.slots || [];
          setScheduleSlots(slots);
          if (!isPreview) {
            localStorage.setItem('public_schedule_cache', JSON.stringify(slots));
            localStorage.setItem('public_schedule_version', String(currentVersion));
          }
        } else {
          setScheduleSlots([]);
        }
      } catch (err) {
        console.error("Error fetching public schedule:", err);
      } finally {
        setLoadingSchedule(false);
      }
    };

    loadAggregatedSchedule();
  }, [globalSettings, isPreview]);

  // Handle viewing student distribution for a specific slot
  const handleOpenDistribution = async (slot: ExamSlot) => {
    setActiveSlotForDistribution(slot);
    setSearchStudentQuery('');
    setLoadingDistribution(true);
    setDistributionList([]);
    
    try {
      // Fetch the individual slot document to get its student_distribution
      const slotSnap = await getDoc(doc(db, 'exam_slots', slot.id));
      if (slotSnap.exists()) {
        const slotData = slotSnap.data();
        const dist = slotData.student_distribution || [];
        setDistributionList(dist);
      } else {
        setDistributionList([]);
      }
    } catch (err) {
      console.error("Error loading distribution list:", err);
    } finally {
      setLoadingDistribution(false);
    }
  };

  // Helper to check if distribution is unlocked based on admin-defined hours before start
  const getIsUnlocked = (slot: ExamSlot): boolean => {
    if (isPreview) return true; // Preview overrides unlock hours
    try {
      const slotDateTime = new Date(`${slot.exam_date}T${slot.start_time}`);
      if (isNaN(slotDateTime.getTime())) return false;
      const unlockHours = globalSettings?.distribution_unlock_hours ?? 6;
      const unlockBeforeMs = unlockHours * 60 * 60 * 1000;
      const unlockTime = slotDateTime.getTime() - unlockBeforeMs;
      const now = new Date().getTime();
      return now >= unlockTime;
    } catch (e) {
      return false;
    }
  };

  // Helper to format remaining time text
  const getRemainingTimeText = (slot: ExamSlot): string => {
    if (isPreview) return 'وضع المعاينة - القنوات مفتوحة';
    try {
      const slotDateTime = new Date(`${slot.exam_date}T${slot.start_time}`);
      if (isNaN(slotDateTime.getTime())) return '';
      const unlockHours = globalSettings?.distribution_unlock_hours ?? 6;
      const unlockBeforeMs = unlockHours * 60 * 60 * 1000;
      const unlockTime = slotDateTime.getTime() - unlockBeforeMs;
      const diffMs = unlockTime - new Date().getTime();
      if (diffMs <= 0) return '';
      
      const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
      const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      
      if (diffHrs > 24) {
        const days = Math.ceil(diffHrs / 24);
        return `يفتح قبل الامتحان بـ ${unlockHours} ساعات (متبقي حوالي ${days} أيام)`;
      } else if (diffHrs > 0) {
        return `مغلق (يفتح بعد ${diffHrs} ساعة و ${diffMins} دقيقة)`;
      } else {
        return `مغلق (يفتح بعد ${diffMins} دقيقة)`;
      }
    } catch (e) {
      return 'مغلق مؤقتاً';
    }
  };

  // Filter distribution list based on search query
  const filteredDistribution = distributionList.filter(item => 
    item.student_name.toLowerCase().includes(searchStudentQuery.toLowerCase()) ||
    item.room.toLowerCase().includes(searchStudentQuery.toLowerCase()) ||
    (item.exam_number && item.exam_number.toLowerCase().includes(searchStudentQuery.toLowerCase()))
  );

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  const isScheduleVisible = isPreview || globalSettings?.show_public_schedule === true;
  const isResultsVisible = isPreview || globalSettings?.show_public_results === true;

  return (
    <div className="min-h-screen bg-slate-50/50 flex flex-col font-sans antialiased text-right animate-in fade-in duration-200" dir="rtl">
      {isPreview && (
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-4 py-2.5 text-center text-xs font-bold shadow-sm flex items-center justify-center gap-2">
          <Sparkles size={16} className="animate-pulse" />
          <span>⚠️ وضع المعاينة الذكية النشط: أنت تشاهد الواجهة العامة حالياً للتأكد من دقة البيانات وتوزيع القاعات وصحة العلامات قبل النشر للعموم.</span>
        </div>
      )}
      {/* Dynamic Navigation Header */}
      <header className="sticky top-0 z-40 w-full bg-white/95 backdrop-blur-md border-b border-slate-100 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 md:px-8 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3 hover:opacity-90 transition-opacity">
            {/* Logo/Icon */}
            {globalSettings?.app_logo_url ? (
              <img 
                src={globalSettings.app_logo_url} 
                alt="App Logo" 
                className="w-10 h-10 object-contain rounded-xl shadow-xs border border-slate-100" 
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-black shadow-sm shadow-indigo-200">
                د
              </div>
            )}
            <div className="hidden sm:block">
              <h1 className="text-base font-bold text-slate-900 leading-tight">كلية الهندسة المعمارية</h1>
              <p className="text-[11px] text-slate-500">جامعة دمشق | دمشق، سوريا</p>
            </div>
          </Link>
          
          {/* Action Button */}
          <div className="flex items-center gap-2">
            {user ? (
              <button 
                onClick={() => navigate(isAdmin ? '/admin' : '/dashboard')}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs md:text-sm px-4 py-2.5 rounded-xl transition-all shadow-md shadow-indigo-100 flex items-center gap-2"
              >
                <LayoutDashboard size={16} />
                <span>الذهاب إلى لوحة التحكم</span>
              </button>
            ) : (
              <button 
                onClick={() => navigate('/login')}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs md:text-sm px-4 py-2.5 rounded-xl transition-all shadow-md shadow-indigo-100 flex items-center gap-2"
              >
                <LogIn size={16} />
                <span>تسجيل دخول المراقبين والمشرفين فقط</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 md:px-8 py-10 md:py-14 space-y-8">
        {/* Welcome Section */}
        <div className="text-center space-y-3 max-w-2xl mx-auto">
          <h2 className="text-2xl md:text-4xl font-extrabold text-slate-900 tracking-tight leading-snug">
            بوابة الامتحانات والنتائج الرسمية
          </h2>
          <p className="text-sm md:text-base text-slate-500 font-medium leading-relaxed">
            المنصة الإلكترونية الرسمية لكلية الهندسة المعمارية بجامعة دمشق لتصفح البرامج الامتحانية، وتوزيع القاعات، والنتائج الامتحانية فور صدورها.
          </p>
          <div className="h-1 w-16 bg-indigo-500 mx-auto rounded-full mt-3" />
        </div>

        {/* Giant Section Toggle Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Schedule Toggle Card */}
          <button
            onClick={() => {
              if (isScheduleVisible) {
                setActiveView('schedule');
              }
            }}
            className={`relative rounded-3xl p-6 md:p-8 text-right overflow-hidden transition-all duration-300 shadow-md flex flex-col justify-between h-44 border ${
              !isScheduleVisible 
                ? 'bg-red-50 border-red-200 text-red-900 cursor-not-allowed opacity-90'
                : activeView === 'schedule'
                  ? 'bg-gradient-to-br from-indigo-600 to-indigo-700 border-indigo-500 text-white ring-4 ring-indigo-100 shadow-lg shadow-indigo-100'
                  : 'bg-white border-slate-100 hover:border-indigo-200 hover:bg-slate-50/50 text-slate-800'
            }`}
          >
            {/* Top Row: Icon */}
            <div className="flex justify-between items-center w-full">
              <div className={`p-3 rounded-2xl ${
                !isScheduleVisible
                  ? 'bg-red-100 text-red-600 animate-pulse'
                  : activeView === 'schedule'
                    ? 'bg-white/10 text-white'
                    : 'bg-indigo-50 text-indigo-600'
              }`}>
                <Calendar size={24} />
              </div>
              {!isScheduleVisible && (
                <span className="text-[10px] bg-red-600 text-white px-2.5 py-1 rounded-full font-bold">
                  لم يصدر بعد
                </span>
              )}
            </div>

            {/* Bottom Row: Text */}
            <div className="space-y-1">
              <h3 className="text-lg md:text-xl font-extrabold">البرنامج الامتحاني النهائي وتوزيع القاعات</h3>
              <p className={`text-xs leading-relaxed ${
                activeView === 'schedule' && isScheduleVisible
                  ? 'text-indigo-100'
                  : !isScheduleVisible
                    ? 'text-red-700 font-bold'
                    : 'text-slate-500'
              }`}>
                {isScheduleVisible 
                  ? 'تصفح مواعيد الامتحانات والتبليغات ومقرات المراقبات'
                  : 'لم يصدر البرنامج الامتحاني لهذا الفصل بعد'}
              </p>
            </div>
          </button>

          {/* Results Toggle Card */}
          <button
            onClick={() => {
              if (isResultsVisible) {
                setActiveView('results');
              }
            }}
            className={`relative rounded-3xl p-6 md:p-8 text-right overflow-hidden transition-all duration-300 shadow-md flex flex-col justify-between h-44 border ${
              !isResultsVisible 
                ? 'bg-red-50 border-red-200 text-red-900 cursor-not-allowed opacity-90'
                : activeView === 'results'
                  ? 'bg-gradient-to-br from-purple-600 to-purple-700 border-purple-500 text-white ring-4 ring-purple-100 shadow-lg shadow-purple-100'
                  : 'bg-white border-slate-100 hover:border-purple-200 hover:bg-slate-50/50 text-slate-800'
            }`}
          >
            {/* Top Row: Icon */}
            <div className="flex justify-between items-center w-full">
              <div className={`p-3 rounded-2xl ${
                !isResultsVisible
                  ? 'bg-red-100 text-red-600 animate-pulse'
                  : activeView === 'results'
                    ? 'bg-white/10 text-white'
                    : 'bg-purple-50 text-purple-600'
              }`}>
                <Trophy size={24} />
              </div>
              {!isResultsVisible && (
                <span className="text-[10px] bg-red-600 text-white px-2.5 py-1 rounded-full font-bold">
                  لم يصدر بعد
                </span>
              )}
            </div>

            {/* Bottom Row: Text */}
            <div className="space-y-1">
              <h3 className="text-lg md:text-xl font-extrabold">النتائج الامتحانية وجداول صدور العلامات</h3>
              <p className={`text-xs leading-relaxed ${
                activeView === 'results' && isResultsVisible
                  ? 'text-purple-100'
                  : !isResultsVisible
                    ? 'text-red-700 font-bold'
                    : 'text-slate-500'
              }`}>
                {isResultsVisible 
                  ? 'البحث المباشر عن العلامات ونتائج المواد والمقررات للطلاب'
                  : 'لم تصدر النتائج الامتحانية بعد'}
              </p>
            </div>
          </button>
        </div>

        {/* Global Loading / Warning Fallback */}
        {loadingSchedule ? (
          <div className="bg-white rounded-3xl p-12 border border-slate-100 shadow-sm flex flex-col items-center justify-center space-y-3">
            <RefreshCw className="animate-spin text-indigo-600" size={32} />
            <p className="text-slate-500 font-bold text-sm">جاري تحميل البيانات وتحديث قاعدة البيانات المباشرة...</p>
          </div>
        ) : activeView === 'schedule' && !isScheduleVisible ? (
          // Schedule Disabled State Details Block
          <div className="bg-red-50/50 border border-red-100 rounded-3xl p-8 text-center max-w-xl mx-auto space-y-4">
            <div className="w-14 h-14 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto">
              <Lock size={26} />
            </div>
            <h3 className="text-lg font-extrabold text-red-950">البرنامج الامتحاني معلق حالياً</h3>
            <p className="text-xs md:text-sm text-red-800 leading-relaxed max-w-md mx-auto">
              يرجى مراجعة إدارة شؤون الطلاب أو الموقع الرسمي في وقت لاحق. سيقوم الموظف والمسؤولون بنشر وتثبيت البرنامج فور إقراره رسمياً من الكلية.
            </p>
          </div>
        ) : activeView === 'results' && !isResultsVisible ? (
          // Results Disabled State Details Block
          <div className="bg-red-50/50 border border-red-100 rounded-3xl p-8 text-center max-w-xl mx-auto space-y-4">
            <div className="w-14 h-14 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto">
              <Lock size={26} />
            </div>
            <h3 className="text-lg font-extrabold text-red-950">النتائج الامتحانية غير منشورة بعد</h3>
            <p className="text-xs md:text-sm text-red-800 leading-relaxed max-w-md mx-auto">
              قامت إدارة الكلية بقفل النتائج ريثما ينتهي التدقيق والمراجعة الشاملة للعلامات ودفاتر الامتحانات الورقية. تابع معنا لمشاهدة الدرجات فور اعتمادها.
            </p>
          </div>
        ) : activeView === 'schedule' ? (
          /* =======================================================
             SCHEDULE VIEW (ACCORDION BY STUDY YEARS)
             ======================================================= */
          <div className="space-y-4 animate-in fade-in duration-200">
            <div className="flex justify-between items-center px-2">
              <h3 className="font-extrabold text-slate-800 text-lg flex items-center gap-2">
                <span>📅 البرنامج الامتحاني وتوزيع الطلاب للسنوات الخمس</span>
              </h3>
            </div>

            <div className="space-y-3">
              {academicYearsList.map((year) => {
                const yearSlots = scheduleSlots
                  .filter(s => s.academic_year === year)
                  .sort((a, b) => {
                    const dateCompare = a.exam_date.localeCompare(b.exam_date);
                    if (dateCompare !== 0) return dateCompare;
                    return a.start_time.localeCompare(b.start_time);
                  });
                const isExpanded = expandedYear === year;

                return (
                  <div 
                    key={year} 
                    className="bg-white rounded-2xl border border-slate-100 shadow-xs overflow-hidden transition-all hover:border-slate-200"
                  >
                    <button
                      onClick={() => setExpandedYear(isExpanded ? null : year)}
                      className={`w-full flex items-center justify-between p-5 text-right font-bold transition-all ${
                        isExpanded ? 'bg-indigo-50/40 text-indigo-900' : 'text-slate-800 hover:bg-slate-50/50'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${
                          isExpanded ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'
                        }`}>
                          {year}
                        </div>
                        <div>
                          <span className="text-base font-bold">
                            {year === 6 ? 'برنامج ماجستير أكاديمي' : year === 7 ? 'برنامج ماجستير تأهيل وتخصص' : `برنامج السنة ${yearNames[year - 1]}`}
                          </span>
                          <span className="text-xs text-slate-400 font-sans font-normal block mt-0.5">{yearSlots.length} مواد مجدولة</span>
                        </div>
                      </div>
                      <div>
                        {isExpanded ? <ChevronUp size={20} className="text-indigo-600" /> : <ChevronDown size={20} className="text-slate-400" />}
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="border-t border-slate-100/60 p-5 pt-0 bg-slate-50/10">
                        {yearSlots.length === 0 ? (
                          <div className="py-10 text-center text-slate-400 text-sm">
                            <Calendar className="mx-auto mb-2 opacity-30" size={36} />
                            <p>لا توجد امتحانات مضافة لهذه السنة بعد.</p>
                          </div>
                        ) : (
                          <div className="overflow-x-auto mt-4">
                            <table className="w-full text-right text-sm border-collapse min-w-[600px] md:min-w-full">
                              <thead>
                                <tr className="border-b border-slate-100 text-slate-500 text-xs bg-slate-50/50">
                                  <th className="py-3 px-4 font-bold">اسم المقرر / المادة</th>
                                  <th className="py-3 px-4 font-bold">تاريخ المادة</th>
                                  <th className="py-3 px-4 font-bold">توقيت المادة (من - إلى)</th>
                                  <th className="py-3 px-4 font-bold text-center">توزيع القاعات الامتحانية</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {yearSlots.map((slot) => {
                                  const unlocked = getIsUnlocked(slot);
                                  const durationText = slot.duration_hours ? `${slot.duration_hours} ساعة` : 'ساعتين';

                                  return (
                                    <tr key={slot.id} className="hover:bg-slate-50/30 transition-colors">
                                      <td className="py-3.5 px-4 font-bold text-slate-900">{slot.course_name}</td>
                                      <td className="py-3.5 px-4 text-slate-600 font-sans font-medium">{slot.exam_date}</td>
                                      <td className="py-3.5 px-4 text-slate-600 font-sans">
                                        <div className="flex items-center gap-2">
                                          <Clock size={13} className="text-slate-400" />
                                          <span className="font-medium">من {slot.start_time} إلى {slot.end_time}</span>
                                          <span className="text-[10px] text-slate-400">({durationText})</span>
                                        </div>
                                      </td>
                                      <td className="py-3.5 px-4 text-center">
                                        {unlocked ? (
                                          <button
                                            onClick={() => handleOpenDistribution(slot)}
                                            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-3.5 py-1.5 rounded-xl transition-all shadow-xs flex items-center gap-1.5 mx-auto"
                                          >
                                            <span>عرض القاعات</span>
                                          </button>
                                        ) : (
                                          <button
                                            disabled
                                            title={getRemainingTimeText(slot)}
                                            className="bg-slate-100 text-slate-400 border border-slate-200 font-bold text-[11px] px-3 py-1.5 rounded-xl flex items-center gap-1 mx-auto cursor-not-allowed opacity-75"
                                          >
                                            <Lock size={12} />
                                            <span>مغلق مؤقتاً</span>
                                          </button>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          /* =======================================================
             RESULTS VIEW (ACCORDION BY STUDY YEARS)
             ======================================================= */
          <div className="space-y-4 animate-in fade-in duration-200">
            <div className="flex justify-between items-center px-2">
              <h3 className="font-extrabold text-slate-800 text-lg flex items-center gap-2">
                <span>🏆 قائمة البرنامج وجداول صدور العلامات والنتائج الرسمية للسنوات الخمس</span>
              </h3>
            </div>

            <div className="space-y-3">
              {academicYearsList.map((year) => {
                const yearSlots = scheduleSlots
                  .filter(s => s.academic_year === year)
                  .sort((a, b) => {
                    const dateCompare = a.exam_date.localeCompare(b.exam_date);
                    if (dateCompare !== 0) return dateCompare;
                    return a.start_time.localeCompare(b.start_time);
                  });
                const isExpanded = expandedResultsYear === year;

                return (
                  <div 
                    key={year} 
                    className="bg-white rounded-2xl border border-slate-100 shadow-xs overflow-hidden transition-all hover:border-slate-200"
                  >
                    <button
                      onClick={() => setExpandedResultsYear(isExpanded ? null : year)}
                      className={`w-full flex items-center justify-between p-5 text-right font-bold transition-all ${
                        isExpanded ? 'bg-purple-50/40 text-purple-900' : 'text-slate-800 hover:bg-slate-50/50'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${
                          isExpanded ? 'bg-purple-600 text-white' : 'bg-slate-100 text-slate-600'
                        }`}>
                          {year}
                        </div>
                        <div>
                          <span className="text-base font-bold">
                            {year === 6 ? 'نتائج وعلامات ماجستير أكاديمي' : year === 7 ? 'نتائج وعلامات ماجستير تأهيل وتخصص' : `نتائج وعلامات السنة ${yearNames[year - 1]}`}
                          </span>
                          <span className="text-xs text-slate-400 font-sans font-normal block mt-0.5">{yearSlots.length} مقررات امتحانية</span>
                        </div>
                      </div>
                      <div>
                        {isExpanded ? <ChevronUp size={20} className="text-purple-600" /> : <ChevronDown size={20} className="text-slate-400" />}
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="border-t border-slate-100/60 p-5 pt-0 bg-slate-50/10">
                        {yearSlots.length === 0 ? (
                          <div className="py-10 text-center text-slate-400 text-sm">
                            <Calendar className="mx-auto mb-2 opacity-30" size={36} />
                            <p>لا توجد امتحانات أو مواد مضافة لهذه السنة بعد.</p>
                          </div>
                        ) : (
                          <div className="space-y-3 mt-4">
                            {yearSlots.map((slot) => {
                              const hasResults = slot.exam_results && slot.exam_results.length > 0;

                              return (
                                <div 
                                  key={slot.id} 
                                  className="bg-white rounded-2xl p-5 border border-slate-100 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between hover:border-purple-200 hover:shadow-sm transition-all gap-4"
                                >
                                  <div>
                                    <span className="text-[10px] text-purple-600 font-bold block mb-1">
                                      {slot.academic_year === 6 ? 'ماجستير أكاديمي' : slot.academic_year === 7 ? 'ماجستير تأهيل وتخصص' : `برنامج السنة ${yearNames[slot.academic_year - 1]}`}
                                    </span>
                                    <h4 className="font-extrabold text-slate-900 text-base leading-tight">
                                      {slot.course_name}
                                    </h4>
                                  </div>

                                  <div className="flex items-center">
                                    {hasResults ? (
                                      <button
                                        onClick={() => {
                                          setActiveSubjectForResults(slot);
                                          setSearchResultStudentQuery('');
                                          setSortResultsTopStudents(false);
                                        }}
                                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs px-4 py-2.5 rounded-xl transition-all shadow-md shadow-emerald-100 flex items-center gap-2"
                                      >
                                        <Trophy size={14} className="animate-bounce" />
                                        <span>صدرت علامة مادة {slot.course_name} 🟢</span>
                                      </button>
                                    ) : (
                                      <div className="inline-flex items-center gap-1.5 bg-rose-50 border border-rose-100/70 px-4 py-2 rounded-xl">
                                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                                        <span className="text-xs font-black text-rose-600">
                                          لم تصدر بعد 🔴
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>

      {/* Student to Room Distribution Modal (Anti-Download & Search Capable) */}
      {activeSlotForDistribution && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4 bg-slate-950/45 backdrop-blur-xs animate-fade-in text-right" dir="rtl">
          <div className="bg-white rounded-3xl w-full max-w-3xl border border-slate-100 shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 flex-row-reverse">
              <div className="text-right space-y-1">
                <span className="text-[10px] bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-full font-bold font-sans">
                  مادة: {activeSlotForDistribution.course_name}
                </span>
                <h3 className="text-lg font-extrabold text-slate-900 mt-1">توزيع القاعات ومراسم الطلاب</h3>
                <p className="text-xs text-slate-400">توزيع رسمي معتمد - يمنع النسخ أو التحميل خارج الموقع</p>
              </div>
              <button 
                onClick={() => setActiveSlotForDistribution(null)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all"
              >
                <X size={20} />
              </button>
            </div>

            {/* Quick Search Bar */}
            <div className="p-4 bg-white border-b border-slate-100">
              <div className="relative max-w-md mx-auto">
                <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  type="text"
                  placeholder="اكتب اسمك للبحث الفوري عن قاعتك..."
                  value={searchStudentQuery}
                  onChange={(e) => setSearchStudentQuery(e.target.value)}
                  className="w-full pr-11 pl-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm transition-all"
                />
              </div>
            </div>

            {/* Modal Content - Distribution Grid */}
            <div className="p-6 overflow-y-auto flex-1 bg-slate-50/30">
              {loadingDistribution ? (
                <div className="py-16 text-center space-y-3">
                  <RefreshCw className="animate-spin text-indigo-600 mx-auto" size={28} />
                  <p className="text-sm text-slate-500 font-bold">جاري جلب جدول التوزيع من السيرفر...</p>
                </div>
              ) : distributionList.length === 0 ? (
                <div className="py-16 text-center text-slate-400 space-y-2">
                  <HelpCircle className="mx-auto text-slate-300" size={48} />
                  <p className="font-bold text-sm">لم يتم رفع جدول توزيع طلاب هذه المادة على القاعات بعد.</p>
                  <p className="text-xs text-slate-400">يرجى المراجعة من قِبل إدارة الامتحانات لاحقاً.</p>
                </div>
              ) : filteredDistribution.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-sm">
                  لا توجد نتائج لمطابقة "<strong>{searchStudentQuery}</strong>"
                </div>
              ) : (
                <div className="border border-slate-100 rounded-3xl bg-white overflow-hidden shadow-xs" style={{ userSelect: 'none' }}>
                  <div className="overflow-x-auto">
                    <table className="w-full text-right text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-50 text-slate-600 font-extrabold border-b border-slate-100">
                          <th className="py-3 px-4 text-right">#</th>
                          <th className="py-3 px-4 text-right">الرقم الامتحاني</th>
                          <th className="py-3 px-4 text-right">اسم الطالب</th>
                          <th className="py-3 px-4 text-left">القاعة الامتحانية / المكان</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredDistribution.map((item, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/40 transition-colors">
                            <td className="py-3.5 px-4 font-sans text-slate-400 font-medium text-right">
                              {idx + 1}
                            </td>
                            <td className="py-3.5 px-4 font-sans font-bold text-slate-500 text-right">
                              {item.exam_number || 'غير متوفر'}
                            </td>
                            <td className="py-3.5 px-4 font-extrabold text-slate-800 text-right">
                              {item.student_name}
                            </td>
                            <td className="py-3.5 px-4 text-left">
                              <span className="inline-flex items-center gap-1.5 bg-indigo-50/70 text-indigo-700 font-extrabold text-[11px] px-3.5 py-1.5 rounded-xl border border-indigo-100/30">
                                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                                <span>{item.room}</span>
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex justify-end">
              <button
                onClick={() => setActiveSlotForDistribution(null)}
                className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs px-5 py-2.5 rounded-xl transition-all"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Student Results Details Modal (Search & Sort Capable, Styled with Red & Green status) */}
      {activeSubjectForResults && (() => {
        let list = [...(activeSubjectForResults.exam_results || [])];

        // Filter by search query (name or exam number)
        if (searchResultStudentQuery.trim()) {
          const q = searchResultStudentQuery.trim().toLowerCase();
          list = list.filter(r => 
            r.student_name.toLowerCase().includes(q) || 
            r.exam_number.toLowerCase().includes(q)
          );
        }

        // Sort by final_score (Top students desc) or alphabetical
        if (sortResultsTopStudents) {
          list.sort((a, b) => b.final_score - a.final_score);
        } else {
          list.sort((a, b) => a.student_name.localeCompare(b.student_name, 'ar'));
        }

        const total = activeSubjectForResults.exam_results?.length || 0;
        const passed = activeSubjectForResults.exam_results?.filter(r => r.status?.trim() === 'ناجح').length || 0;
        const failed = total - passed;
        const rate = total > 0 ? Math.round((passed / total) * 100) : 0;

        return (
          <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4 bg-slate-950/45 backdrop-blur-xs animate-fade-in text-right" dir="rtl">
            <div className="bg-white rounded-3xl w-full max-w-4xl border border-slate-100 shadow-2xl flex flex-col max-h-[88vh] overflow-hidden">
              {/* Modal Header */}
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 flex-row-reverse">
                <div className="text-right space-y-1">
                  <span className="text-[10px] bg-purple-50 text-purple-700 px-2.5 py-1 rounded-full font-bold font-sans">
                    {activeSubjectForResults.academic_year === 6 ? 'نتائج ماجستير أكاديمي' : activeSubjectForResults.academic_year === 7 ? 'نتائج ماجستير تأهيل وتخصص' : `نتائج السنة ${yearNames[activeSubjectForResults.academic_year - 1]}`}
                  </span>
                  <h3 className="text-lg font-black text-slate-900 mt-1">
                    جدول علامات مادة: {activeSubjectForResults.course_name}
                  </h3>
                  <p className="text-xs text-slate-400">النتائج الرسمية المعتمدة والمعلنة من الكلية</p>
                </div>
                <button 
                  onClick={() => setActiveSubjectForResults(null)}
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Quick Filter & Stats panel */}
              <div className="p-4 md:p-6 bg-slate-50/50 border-b border-slate-100 space-y-4">
                {/* Quick Stats Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-white rounded-2xl p-3 border border-slate-100 shadow-xs flex flex-col items-center text-center">
                    <span className="text-[10px] font-bold text-slate-400">المتقدمون للامتحان</span>
                    <span className="text-lg font-black text-slate-900 font-sans mt-0.5">{total}</span>
                  </div>
                  <div className="bg-white rounded-2xl p-3 border border-slate-100 shadow-xs flex flex-col items-center text-center">
                    <span className="text-[10px] font-bold text-emerald-500">الطلاب الناجحون</span>
                    <span className="text-lg font-black text-emerald-600 font-sans mt-0.5">{passed}</span>
                  </div>
                  <div className="bg-white rounded-2xl p-3 border border-slate-100 shadow-xs flex flex-col items-center text-center">
                    <span className="text-[10px] font-bold text-red-500">الطلاب الراسبون</span>
                    <span className="text-lg font-black text-red-600 font-sans mt-0.5">{failed}</span>
                  </div>
                  <div className="bg-purple-50/30 rounded-2xl p-3 border border-purple-100 shadow-xs flex flex-col items-center justify-center text-center">
                    <span className="text-[10px] font-bold text-purple-600">نسبة النجاح</span>
                    <span className="text-lg font-black text-purple-700 font-sans mt-0.5">{rate}%</span>
                  </div>
                </div>

                {/* Search & Sort Controls */}
                <div className="flex flex-col sm:flex-row gap-3 items-center justify-between pt-1">
                  {/* Text Search Input */}
                  <div className="relative w-full sm:max-w-md">
                    <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input
                      type="text"
                      placeholder="ابحث باسم الطالب أو الرقم الامتحاني..."
                      value={searchResultStudentQuery}
                      onChange={(e) => setSearchResultStudentQuery(e.target.value)}
                      className="w-full pr-11 pl-4 py-2 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none text-xs font-bold transition-all"
                    />
                    {searchResultStudentQuery && (
                      <button 
                        onClick={() => setSearchResultStudentQuery('')}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>

                  {/* Sort Toggle Button */}
                  <button
                    onClick={() => setSortResultsTopStudents(!sortResultsTopStudents)}
                    className={`px-4 py-2 rounded-xl text-xs font-extrabold transition-all flex items-center gap-2 border w-full sm:w-auto justify-center ${
                      sortResultsTopStudents 
                        ? 'bg-purple-600 border-purple-500 text-white shadow-xs shadow-purple-100' 
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <Trophy size={14} className={sortResultsTopStudents ? 'text-white' : 'text-purple-500'} />
                    <span>ترتيب أوائل الطلاب تنازلياً 🏆</span>
                  </button>
                </div>
              </div>

              {/* Table Container */}
              <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-slate-50/10">
                {list.length === 0 ? (
                  <div className="py-12 text-center text-slate-400 text-xs font-bold">
                    لا توجد نتائج مطابقة لخيارات البحث.
                  </div>
                ) : (
                  <div className="border border-slate-100 rounded-2xl bg-white overflow-hidden shadow-xs">
                    <div className="overflow-x-auto">
                      <table className="w-full text-right text-xs border-collapse min-w-[600px]">
                        <thead>
                          <tr className="bg-slate-50 text-slate-600 font-bold border-b border-slate-100">
                            <th className="py-3 px-4">الرقم الامتحاني</th>
                            <th className="py-3 px-4">اسم الطالب</th>
                            <th className="py-3 px-4 text-center">علامة العملي</th>
                            <th className="py-3 px-4 text-center">علامة النظري</th>
                            <th className="py-3 px-4 text-center font-bold text-slate-900 bg-slate-100/30">المحصلة النهائية</th>
                            <th className="py-3 px-4 text-center">النتيجة</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {list.map((res, index) => {
                            const isPass = res.status?.trim() === 'ناجح';
                            return (
                              <tr key={index} className="hover:bg-slate-50/40 transition-colors">
                                <td className="py-3.5 px-4 font-sans font-bold text-slate-500">{res.exam_number}</td>
                                <td className="py-3.5 px-4 font-extrabold text-slate-900">{res.student_name}</td>
                                <td className="py-3.5 px-4 text-center font-sans font-medium text-slate-500">{res.practical_grade ?? '-'}</td>
                                <td className="py-3.5 px-4 text-center font-sans font-medium text-slate-500">{res.theory_grade ?? '-'}</td>
                                <td className="py-3.5 px-4 text-center font-sans font-black text-indigo-700 bg-slate-100/10">{res.final_score ?? '-'}</td>
                                <td className="py-3.5 px-4 text-center">
                                  <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-[10px] font-bold ${
                                    isPass 
                                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' 
                                      : 'bg-red-50 text-red-700 border border-red-100'
                                  }`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${isPass ? 'bg-emerald-500' : 'bg-red-500'}`} />
                                    {res.status || 'غير محدد'}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex justify-end">
                <button
                  onClick={() => setActiveSubjectForResults(null)}
                  className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs px-5 py-2.5 rounded-xl transition-all"
                >
                  إغلاق نافذة النتائج
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Dynamic Rights Footer */}
      <DeveloperFooter className="mt-auto border-t border-slate-100 bg-white" />
    </div>
  );
}
