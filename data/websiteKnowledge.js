// Sansal / PrepMitra — Knowledge base for the AI Support Assistant.
// This is the single source of truth the assistant uses to answer "how do I..." questions.
// Keep entries short, factual, and action-oriented. Each entry should map a user
// intent to: what it is, where to find it, and the exact steps to use it.

const PLATFORM = {
  name: 'Sansal (also branded as PrepMitra)',
  audience: 'Engineering students preparing for placements & interviews',
  tagline: 'AI-powered interview prep, mentorship, courses, and coding practice — all in one place.',
};

// High-level feature map. Each feature has a `route` (frontend path), a short
// description, and concrete how-to steps the assistant can read aloud.
const FEATURES = [
  {
    key: 'mock_interview',
    title: 'AI Mock Interviews',
    route: '/interview/technical',
    description:
      'Live, voice-based AI interviews. The AI listens, asks follow-up questions, scores each answer, and gives a full performance report.',
    types: [
      { name: 'HR Interview', route: '/interview/hr', focus: 'Behavioral, motivation, culture-fit (STAR framework).' },
      { name: 'Technical Interview', route: '/interview/technical', focus: 'CS fundamentals, DSA, system design, role-specific stack.' },
      { name: 'Resume-based Interview', route: '/interview/resume', focus: 'Questions grounded in your uploaded resume.' },
    ],
    howTo: [
      'Open the interview type you want (HR / Technical / Resume).',
      'Fill in your role, experience level, difficulty, and language.',
      'Click Start Interview — allow microphone access.',
      'Speak your answers naturally. The AI follows up like a real interviewer.',
      'When done, you get a detailed score report with strengths and areas to improve.',
    ],
  },
  {
    key: 'experts',
    title: 'Book a Mentor / Expert',
    route: '/experts',
    description:
      '1:1 paid sessions with industry experts and senior engineers for mock interviews, career guidance, resume review, and doubt-solving.',
    howTo: [
      'Go to the Experts page (/experts).',
      'Filter by domain (SDE, Data, Product, etc.), price, or rating.',
      'Click an expert to see their profile, slots, and reviews.',
      'Pick an available slot and confirm payment via Razorpay.',
      'A Google Meet link is generated automatically and sent to your email.',
    ],
    relatedRoutes: { bookings: '/bookings', chat: '/chat' },
  },
  {
    key: 'bookings',
    title: 'My Bookings',
    route: '/bookings',
    description:
      'View all your booked mentor sessions — upcoming, completed, cancelled. Join meetings, see Meet links, and download invoices.',
    howTo: [
      'Open /bookings or Dashboard → Sessions.',
      'Upcoming sessions show a "Join Meeting" button when it is time.',
      'You can cancel up to 4 hours before the session for a refund (per policy).',
    ],
  },
  {
    key: 'courses',
    title: 'Courses & Playlists',
    route: '/courses',
    description:
      'Curated video courses on DSA, system design, web dev, and placement prep. Buy a course → it appears in your dashboard.',
    howTo: [
      'Browse /courses. Click a course for details, syllabus, and reviews.',
      'Click Enroll → pay via Razorpay (some courses are free).',
      'After enrollment, the course shows up in Dashboard → My Courses.',
      'Watch lessons, submit assignments, ask questions, get certificate on completion.',
    ],
  },
  {
    key: 'aptitude',
    title: 'Aptitude Practice',
    route: '/practice/aptitude',
    description:
      'Topic-wise aptitude tests (quant, logical, verbal) and full-length mock tests. Tracks accuracy, time per question, and weak areas.',
    howTo: [
      'Open /practice/aptitude.',
      'Pick a topic or a full mock test.',
      'Attempt → see detailed solutions and your performance analytics in Dashboard → Aptitude.',
    ],
  },
  {
    key: 'coding',
    title: 'Coding Practice',
    route: '/practice/coding',
    description:
      'LeetCode-style coding problems with an in-browser editor (Judge0 backend). Includes "Daily Coding" challenge and difficulty-tagged practice problems.',
    howTo: [
      'Open /practice/coding for problem list, /practice/coding/daily for the daily challenge.',
      'Click a problem → write code in the editor → Run or Submit.',
      'Your submissions are saved to your dashboard with verdicts and runtime stats.',
    ],
  },
  {
    key: 'resume',
    title: 'Resume Builder',
    route: '/dashboard/resume',
    description:
      'AI-assisted resume builder. Add education, projects, experience, skills, then preview/download as PDF. The resume can also feed into Resume-based mock interviews.',
    howTo: [
      'Dashboard → Resume.',
      'Fill each section (Profile, Education, Projects, Experience, Skills).',
      'Click Preview → tweak template → Download PDF.',
    ],
  },
  {
    key: 'notes',
    title: 'Notes Library',
    route: '/notes',
    description:
      'Curated PDF notes for CS subjects, interview topics, and placement prep. Free to read in-browser, downloadable for enrolled users.',
    howTo: [
      'Open /notes → browse by topic.',
      'Click a note to read; sign in to download.',
    ],
  },
  {
    key: 'chat',
    title: 'Chat with Experts',
    route: '/chat',
    description:
      'Real-time chat with experts you have booked or interacted with. Send text, images, and files.',
    howTo: [
      'Open /chat to see your conversation list.',
      'Click a thread or open chat directly from an expert profile.',
    ],
  },
  {
    key: 'become_expert',
    title: 'Become an Expert (Mentor)',
    route: '/expert/become-expert',
    description:
      'Apply to become a paid mentor on the platform. After approval, you can set slots, prices, and earn from sessions.',
    howTo: [
      'Sign in → /expert/become-expert.',
      'Fill the application (profile, experience, expertise, ID proof).',
      'Submit → admin reviews → you get email on approval.',
      'After approval, log in at expert.sansal.in to manage slots and earnings.',
    ],
  },
  {
    key: 'dashboard',
    title: 'Your Dashboard',
    route: '/dashboard',
    description:
      'One place to see your interviews, courses, bookings, notes, aptitude scores, coding submissions, and notifications.',
    sections: [
      { name: 'Overview', route: '/dashboard/overview' },
      { name: 'Profile', route: '/dashboard/profile' },
      { name: 'Interviews', route: '/dashboard/interviews' },
      { name: 'Notes', route: '/dashboard/notes' },
      { name: 'Courses', route: '/dashboard/courses' },
      { name: 'Sessions', route: '/dashboard/sessions' },
      { name: 'Aptitude', route: '/dashboard/aptitude' },
      { name: 'Resume', route: '/dashboard/resume' },
      { name: 'Notifications', route: '/dashboard/notifications' },
      { name: 'Settings', route: '/dashboard/settings' },
    ],
  },
  {
    key: 'auth',
    title: 'Sign Up & Login',
    route: '/signup',
    description:
      'Create an account using email + OTP or Google sign-in (Firebase). Email OTP verification is required to unlock all features.',
    howTo: [
      'Click Sign Up → enter email + password OR continue with Google.',
      'Verify the OTP sent to your email.',
      'You are in — set up your profile in Dashboard → Profile.',
    ],
  },
  {
    key: 'payments',
    title: 'Payments & Refunds',
    route: null,
    description:
      'Payments are processed securely via Razorpay (UPI, cards, netbanking, wallets). Invoices are emailed after every successful payment.',
    refundPolicy:
      'Sessions cancelled at least 4 hours before the scheduled time are eligible for a refund. Course refunds are handled case-by-case within 7 days of purchase, only if no significant content has been consumed.',
    howTo: [
      'On checkout, the Razorpay popup opens with all payment options.',
      'After success, you get an email receipt; the booking/course unlocks immediately.',
      'For refund or invoice issues, contact /contact or email sansal.partnerships@gmail.com.',
    ],
  },
];

// FAQs the assistant should know cold.
const FAQS = [
  {
    q: 'How do I start a mock interview?',
    a: 'Go to /interview/technical (or /interview/hr or /interview/resume), pick your role and difficulty, allow microphone, and hit Start. You will speak with the AI like a real interview.',
  },
  {
    q: 'Is the mock interview free?',
    a: 'Yes — AI mock interviews are free. 1:1 sessions with human experts on /experts are paid.',
  },
  {
    q: 'How do I book a 1:1 mentor session?',
    a: 'Open /experts, choose a mentor, pick a slot, and pay via Razorpay. A Google Meet link is auto-generated and emailed to you.',
  },
  {
    q: 'Can I cancel a booking?',
    a: 'Yes, you can cancel from /bookings or Dashboard → Sessions. Cancellations made at least 4 hours before the session qualify for a refund.',
  },
  {
    q: 'Where do I see my purchased courses?',
    a: 'Dashboard → Courses (/dashboard/courses). Click any enrolled course to resume lessons.',
  },
  {
    q: 'I did not get the OTP / verification email.',
    a: 'Check your spam folder. If still missing, click "Resend OTP" on the verify page. Still stuck → /contact.',
  },
  {
    q: 'How do I download my resume as PDF?',
    a: 'Dashboard → Resume → fill the sections → click Preview → Download PDF.',
  },
  {
    q: 'How do I become a mentor / expert?',
    a: 'Sign in, go to /expert/become-expert, submit the application form. Admin reviews and emails you on approval.',
  },
  {
    q: 'What languages does the AI interviewer support?',
    a: 'Indian English (default), American English, British English, and Hindi. You can pick the language when you configure the interview.',
  },
  {
    q: 'My payment was deducted but booking did not confirm.',
    a: 'Refresh /bookings — most issues resolve in 1–2 minutes. If the booking still does not show after 10 minutes, contact /contact with your Razorpay payment ID. Refund is automatic if the booking was not created.',
  },
  {
    q: 'How do I contact support?',
    a: 'Visit /contact, or email sansal.partnerships@gmail.com. The community page (/community) is also a good place to ask questions.',
  },
  {
    q: 'Is my data safe?',
    a: 'Yes. We use industry-standard encryption (JWT auth, HTTPS, Firebase auth). See /privacy-policy for details.',
  },
];

// Quick navigation map — for "where is X?" questions.
const NAVIGATION = {
  '/': 'Landing page',
  '/interview/hr': 'Start an HR mock interview',
  '/interview/technical': 'Start a technical mock interview',
  '/interview/resume': 'Start a resume-based mock interview',
  '/experts': 'Browse and book mentors',
  '/bookings': 'My booked sessions',
  '/chat': 'Chat with experts',
  '/courses': 'Browse courses',
  '/notes': 'Notes library',
  '/practice/aptitude': 'Aptitude practice',
  '/practice/coding': 'Coding practice',
  '/practice/coding/daily': 'Daily coding challenge',
  '/dashboard': 'Your dashboard (interviews, courses, bookings, etc.)',
  '/dashboard/resume': 'Resume builder',
  '/expert/become-expert': 'Apply to become a mentor',
  '/about': 'About us',
  '/help': 'Help center',
  '/faqs': 'Frequently asked questions',
  '/contact': 'Contact us',
  '/community': 'Community page',
  '/privacy-policy': 'Privacy policy',
  '/terms-of-service': 'Terms of service',
  '/login': 'Login',
  '/signup': 'Sign up',
};

// Serialize the knowledge base into a compact text block the LLM can read in a
// single system prompt. Kept small (~2-3k tokens) so it fits comfortably.
function buildKnowledgeBlock() {
  const lines = [];
  lines.push(`# Platform: ${PLATFORM.name}`);
  lines.push(`Audience: ${PLATFORM.audience}`);
  lines.push(`What it is: ${PLATFORM.tagline}`);
  lines.push('');

  lines.push('## Features');
  for (const f of FEATURES) {
    lines.push(`### ${f.title}${f.route ? ` (${f.route})` : ''}`);
    lines.push(f.description);
    if (f.types) {
      for (const t of f.types) lines.push(`- ${t.name} (${t.route}): ${t.focus}`);
    }
    if (f.sections) {
      lines.push(`Sections: ${f.sections.map((s) => `${s.name} → ${s.route}`).join('; ')}`);
    }
    if (f.howTo) {
      lines.push('Steps:');
      f.howTo.forEach((step, i) => lines.push(`  ${i + 1}. ${step}`));
    }
    if (f.refundPolicy) lines.push(`Refund policy: ${f.refundPolicy}`);
    lines.push('');
  }

  lines.push('## Frequently Asked Questions');
  for (const item of FAQS) {
    lines.push(`Q: ${item.q}`);
    lines.push(`A: ${item.a}`);
    lines.push('');
  }

  lines.push('## Site Navigation (route → what is there)');
  for (const [route, label] of Object.entries(NAVIGATION)) {
    lines.push(`- ${route} — ${label}`);
  }

  return lines.join('\n');
}

module.exports = {
  PLATFORM,
  FEATURES,
  FAQS,
  NAVIGATION,
  buildKnowledgeBlock,
};
