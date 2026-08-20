export type Locale = "ru" | "en";

export interface CaseStudy {
  id: "markiro" | "idento" | "quokkaq";
  name: string;
  status: string;
  problem: string;
  role: string;
  solution: string;
  outcome: string;
  href: string;
  tags: readonly string[];
}

export interface SiteContent {
  meta: {
    title: string;
    description: string;
  };
  skip: string;
  navigation: {
    work: string;
    expertise: string;
    approach: string;
    about: string;
    contact: string;
    homeLabel: string;
    primaryLabel: string;
    languageLabel: string;
    menuOpen: string;
    menuClose: string;
  };
  availability: string;
  hero: {
    kicker: string;
    title: string;
    lead: string;
    speciality: string;
    discuss: string;
    viewWork: string;
  };
  proof: {
    label: string;
    companies: string;
    companiesCaption: string;
    years: string;
    yearsCaption: string;
    users: string;
    usersCaption: string;
    errors: string;
    errorsCaption: string;
    time: string;
    timeCaption: string;
  };
  work: {
    eyebrow: string;
    title: string;
    lead: string;
    cta: string;
  };
  cases: readonly CaseStudy[];
  moreProjects: {
    eyebrow: string;
    items: readonly Project[];
  };
  expertise: {
    eyebrow: string;
    title: string;
    lead: string;
    items: readonly ContentItem[];
  };
  approach: {
    eyebrow: string;
    title: string;
    lead: string;
    items: readonly ContentItem[];
  };
  about: {
    eyebrow: string;
    title: string;
    body: string;
    bodyTwo: string;
  };
  contact: {
    eyebrow: string;
    title: string;
    lead: string;
    telegram: string;
    email: string;
    formName: string;
    formContact: string;
    formMessage: string;
    formSubmit: string;
    formNote: string;
    formSuccess: string;
  };
  footerLine: string;
}

export interface ContentItem {
  number: string;
  title: string;
  description: string;
}

export interface Project {
  id: "sys-004" | "sys-005";
  name: string;
  description: string;
  status: string;
  href: string;
}
