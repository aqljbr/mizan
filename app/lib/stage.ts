// The stage demo: one click fills the form with the flagship problem and its order file (demo mode only).
export const STAGE = {
  sample: "lazeez_orders.csv",
  en: {
    client: "Lazeez",
    role: "Head of growth and risk at Lazeez, a Dubai food-delivery app",
    question: "Our welcome-voucher and refund costs are rising fast. Finance wants to cut the new-user voucher budget by 30% next quarter. Is that the right move, and where is the money actually leaking?",
    briefing: "Attached: every order from Q1 2026 (about 26,000 orders) with customer, phone, email, device, card fingerprint, delivery address, area, restaurant, rider, order value, promo code, discount, and refunds. The welcome voucher is AED 40 off a new account's first order. We suspect some abuse but have no fraud team yet.",
  },
  ar: {
    client: "لذيذ",
    role: "رئيس النمو والمخاطر في لذيذ، تطبيق توصيل طعام في دبي",
    question: "تكاليف قسائم الترحيب والمبالغ المستردة ترتفع بسرعة. تريد الإدارة المالية خفض ميزانية قسيمة المستخدم الجديد بنسبة 30% في الربع القادم. هل هذه الخطوة الصحيحة، وأين يتسرّب المال فعلًا؟",
    briefing: "مرفق: كل طلبات الربع الأول 2026 (نحو 26 ألف طلب) مع العميل والهاتف والبريد والجهاز وبصمة البطاقة وعنوان التوصيل والمنطقة والمطعم والسائق وقيمة الطلب ورمز العرض والخصم والمبالغ المستردة. قسيمة الترحيب 40 درهمًا على أول طلب لحساب جديد. نشك في وجود إساءة استخدام وليس لدينا فريق احتيال بعد.",
  },
};
export const STAGE_FILES = new Set([STAGE.sample]);
