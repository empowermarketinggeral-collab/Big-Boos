import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "./lib/supabaseClient.js";
import {
  LayoutGrid, Briefcase, FileText, BarChart3, Users, Settings,
  Calendar, BookOpen, ArrowLeft, Bell, Plus, CheckCircle2, XCircle,
  Clock, ChevronRight, BookMarked, ClipboardList, Layers, Video,
  Link2, Calculator, Sparkles, Eye, Zap, Target, TrendingUp,
  Trash2, Pencil, ChevronUp, ChevronDown, Image as ImageIcon,
  Instagram, Facebook, Youtube, MessageCircle, Music2, Palette, Handshake,
} from "lucide-react";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, AreaChart, Area, Line, Legend,
} from "recharts";

/* ---------------------------------------------------------
   TOKENS — versão leve
   ink        #17151F  texto principal
   sidebarBg  #FFFFFF  sidebar clara
   boss       #7C4DE0  roxo — toque de exuberância, nunca base
   bossDeep   #5E35C4  roxo mais profundo (gradientes)
   bossSoft   #F1ECFC  tint de roxo (estado ativo, badges)
   paper      #F6F5FA  fundo da app
   mist       #6E6980  texto secundário
   line       #EAE7F1  bordas
   sage/amber/rose — estados (saudável / atenção / crítico)
--------------------------------------------------------- */
const c = {
  ink: "#17151F",
  sidebarBg: "#FFFFFF",
  boss: "#7C4DE0",
  bossDeep: "#5E35C4",
  bossSoft: "#F1ECFC",
  paper: "#F6F5FA",
  mist: "#6E6980",
  mistLight: "#9691A6",
  line: "#EAE7F1",
  sage: "#2F9E63",
  amber: "#C9821F",
  rose: "#D3455B",
};

const FONTS = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Inter:wght@400;500;600;700&display=swap');

* { box-sizing: border-box; }

.bb-page { padding: 8px 40px 60px; max-width: 1040px; }

@media (max-width: 860px) {
  .bb-app { flex-direction: column; }
  .bb-sidebar {
    width: 100% !important;
    min-height: 0 !important;
    flex-direction: row !important;
    align-items: center;
    position: sticky;
    top: 0;
    z-index: 30;
    border-right: none !important;
    border-bottom: 1px solid ${c.line};
    overflow-x: auto;
  }
  .bb-sidebar-logo { padding: 10px 12px !important; flex-shrink: 0; border-bottom: none !important; }
  .bb-sidebar-nav {
    flex: none !important;
    display: flex !important;
    flex-direction: row !important;
    padding: 6px 8px !important;
    overflow-x: auto;
    gap: 2px;
  }
  .bb-sidebar-nav-item {
    flex-direction: column !important;
    gap: 3px !important;
    font-size: 9.5px !important;
    padding: 6px 8px !important;
    white-space: nowrap;
    border-left: none !important;
    border-bottom: 2px solid transparent;
  }
  .bb-sidebar-footer { display: none !important; }
  .bb-topbar-logout { display: flex !important; }

  .bb-page { padding: 16px 16px 90px !important; max-width: 100% !important; }
  .bb-topbar { padding: 12px 16px 0 !important; }

  :root {
    --bb-grid-3: 1fr;
    --bb-grid-2: 1fr;
    --bb-grid-4: repeat(2, 1fr);
    --bb-grid-5: repeat(2, 1fr);
    --bb-split: 1fr;
  }
}

@media (max-width: 520px) {
  :root {
    --bb-grid-4: 1fr;
  }
}
`;

const serif = { fontFamily: "'Fraunces', serif" };
const sans = { fontFamily: "'Inter', sans-serif" };

/* ---------------------------------------------------------
   MARCAS — ligação ao Supabase (tabela `brands`)
--------------------------------------------------------- */
const CATEGORY_LABELS = {
  salao: "Salão",
  estetica: "Estética",
  barbearia: "Barbearia",
  clinica: "Clínica",
  restaurante: "Restaurante",
  varejo: "Varejo / Moda",
  servicos: "Serviços",
  outro: "Outro",
};

const EMPTY_BRAND_BOOK = { colors: [], typography: { heading: "", body: "" }, textures: [], guidelines: "" };

function mapBrandRow(row) {
  const brandBook = row.brand_book && Object.keys(row.brand_book).length ? row.brand_book : EMPTY_BRAND_BOOK;
  return {
    id: row.id,
    agencyId: row.agency_id,
    name: row.name,
    category: CATEGORY_LABELS[row.category] || row.category,
    categoryKey: row.category,
    status: row.status,
    goal: row.goal || "",
    logoUrl: row.logo_url,
    initial: (row.name || "?").charAt(0).toUpperCase(),
    contractScope: row.contract_scope || "",
    brandBook: {
      colors: brandBook.colors || [],
      typography: { heading: brandBook.typography?.heading || "", body: brandBook.typography?.body || "" },
      textures: brandBook.textures || [],
      guidelines: brandBook.guidelines || "",
    },
  };
}

function useBrands(enabled) {
  return useQuery({
    queryKey: ["brands"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("brands")
        .select("id, agency_id, name, logo_url, goal, category, status, contract_scope, brand_book")
        .order("name");
      if (error) throw error;
      return data.map(mapBrandRow);
    },
  });
}

async function uploadBrandLogo(brandId, file) {
  const ext = file.name.split(".").pop();
  const path = `${brandId}/logo-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("brand-logos").upload(path, file, { upsert: true });
  if (error) throw error;
  const { data } = supabase.storage.from("brand-logos").getPublicUrl(path);
  return data.publicUrl;
}

function useUpdateBrandBook(brandId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ logoUrl, contractScope, brandBook }) => {
      const { error } = await supabase
        .from("brands")
        .update({ logo_url: logoUrl, contract_scope: contractScope, brand_book: brandBook })
        .eq("id", brandId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["brands"] }),
  });
}

async function resolveDefaultAgencyId(session) {
  if (session.agency_id) return session.agency_id;
  const { data, error } = await supabase
    .from("agencies")
    .select("id")
    .eq("is_root", true)
    .single();
  if (error) throw error;
  return data.id;
}

function useAddBrand() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (session) => {
      const agencyId = await resolveDefaultAgencyId(session);
      const { data, error } = await supabase
        .from("brands")
        .insert({
          agency_id: agencyId,
          name: "Nova marca",
          category: "outro",
          status: "green",
          goal: "Define aqui o objetivo desta marca.",
        })
        .select()
        .single();
      if (error) throw error;
      return mapBrandRow(data);
    },
    onSuccess: (newBrand) => {
      queryClient.setQueryData(["brands"], (old = []) => [...old, newBrand]);
    },
  });
}

/* ---------------------------------------------------------
   CONTEÚDOS + ROTEIROS — ligação ao Supabase
--------------------------------------------------------- */
const CONTENT_TYPE_LABELS = { post: "Post", reel: "Reel", carrossel: "Carrossel" };
const CONTENT_TYPE_KEY_BY_LABEL = { Post: "post", Reel: "reel", Carrossel: "carrossel" };
const PLATFORM_LABELS = { instagram: "Instagram", facebook: "Facebook", tiktok: "TikTok", linkedin: "LinkedIn", threads: "Threads" };

function formatDatePt(isoDate) {
  if (!isoDate) return "Sem data";
  const d = new Date(isoDate + "T00:00:00");
  return d.toLocaleDateString("pt-PT", { day: "numeric", month: "short" });
}

function guessMediaKind(mediaUrl) {
  if (!mediaUrl) return null;
  const ext = mediaUrl.split(".").pop().toLowerCase();
  if (["mp4", "mov", "webm"].includes(ext)) return "video";
  if (["zip"].includes(ext)) return "carousel";
  return "image";
}

function mapContentRow(row) {
  return {
    id: row.id,
    type: CONTENT_TYPE_LABELS[row.type] || row.type,
    platformKeys: row.platform || [],
    platforms: (row.platform || []).map((p) => PLATFORM_LABELS[p] || p),
    title: row.title || "(sem título)",
    status: row.approval_status,
    date: formatDatePt(row.scheduled_date),
    note: row.client_note || "",
    mediaKind: guessMediaKind(row.media_url),
    mediaLabel: row.media_url ? row.media_url.split("/").pop() : null,
    mediaUrl: row.media_url,
    copy: row.caption || "",
  };
}

function mapScriptRow(row) {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    note: row.client_note || "",
    text: row.content || "",
  };
}

function useContents(brandId, enabled) {
  return useQuery({
    queryKey: ["contents", brandId],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contents")
        .select("id, type, platform, title, approval_status, scheduled_date, client_note, media_url, caption, created_at")
        .eq("brand_id", brandId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data.map(mapContentRow);
    },
  });
}

function useScripts(brandId, enabled) {
  return useQuery({
    queryKey: ["scripts", brandId],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("scripts")
        .select("id, title, content, status, client_note, created_at")
        .eq("brand_id", brandId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data.map(mapScriptRow);
    },
  });
}

function useApproveContent(brandId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status, note }) => {
      const { error } = await supabase.rpc("approve_content", { p_id: id, p_status: status, p_note: note || null });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["contents", brandId] }),
  });
}

function useApproveScript(brandId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status, note }) => {
      const { error } = await supabase.rpc("approve_script", { p_id: id, p_status: status, p_note: note || null });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["scripts", brandId] }),
  });
}

function useAddContent(brandId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ createdBy, typeLabel, platformKeys, title, scheduledDate, copy }) => {
      const { data, error } = await supabase
        .from("contents")
        .insert({
          brand_id: brandId,
          created_by: createdBy,
          type: CONTENT_TYPE_KEY_BY_LABEL[typeLabel] || "post",
          platform: platformKeys || [],
          title,
          scheduled_date: scheduledDate || null,
          caption: copy,
        })
        .select()
        .single();
      if (error) throw error;
      return mapContentRow(data);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["contents", brandId] }),
  });
}

function useAddScript(brandId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ title, text }) => {
      const { data, error } = await supabase
        .from("scripts")
        .insert({ brand_id: brandId, title, content: text })
        .select()
        .single();
      if (error) throw error;
      return mapScriptRow(data);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["scripts", brandId] }),
  });
}

/* ---------------------------------------------------------
   PLANO ESTRATÉGICO — ligação ao Supabase (tabela action_plans)
--------------------------------------------------------- */
const REVIEW_FREQ_LABELS = { daily: "Revisão diária", weekly: "Revisão semanal", biweekly: "Revisão quinzenal", monthly: "Revisão mensal" };

function mapActionPlanRow(row) {
  const goals = (row.goals || []).map((g) => ({ text: g.description, done: !!g.completed, targetDate: g.target_date || null }));
  return {
    id: row.id,
    title: row.title,
    freq: REVIEW_FREQ_LABELS[row.review_frequency] || "Sem frequência definida",
    reviewFrequencyKey: row.review_frequency,
    status: row.status,
    goals,
    done: goals.filter((g) => g.done).length,
    total: goals.length,
  };
}

function useActionPlans(brandId, enabled) {
  return useQuery({
    queryKey: ["action_plans", brandId],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("action_plans")
        .select("id, title, review_frequency, status, goals, created_at")
        .eq("brand_id", brandId)
        .order("created_at");
      if (error) throw error;
      return data.map(mapActionPlanRow);
    },
  });
}

function useAddActionPlan(brandId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ title, reviewFrequency, description }) => {
      const { data, error } = await supabase
        .from("action_plans")
        .insert({ brand_id: brandId, title, review_frequency: reviewFrequency, description: description || null, goals: [] })
        .select()
        .single();
      if (error) throw error;
      return mapActionPlanRow(data);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["action_plans", brandId] }),
  });
}

function useSaveGoals(brandId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, goals }) => {
      const dbGoals = goals.map((g) => ({ description: g.text, completed: g.done, target_date: g.targetDate || null }));
      const { error } = await supabase.from("action_plans").update({ goals: dbGoals }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["action_plans", brandId] }),
  });
}

/* ---------------------------------------------------------
   DASHBOARDS — ligação ao Supabase (tabela reports)
--------------------------------------------------------- */
function mapReportRow(row) {
  const tm = row.top_metrics || {};
  const demographics = row.demographics && Object.keys(row.demographics).length
    ? row.demographics
    : { idade: [], genero: [], local: [] };
  return {
    id: row.id,
    title: row.title,
    reach: tm.reach?.value ?? "0",
    reachTrend: tm.reach?.trend ?? "",
    engagement: tm.engagement?.value ?? "0%",
    engagementTrend: tm.engagement?.trend ?? "",
    conversions: tm.conversions?.value ?? "0",
    conversionsTrend: tm.conversions?.trend ?? "",
    roi: tm.roi?.value ?? "0%",
    roiTrend: tm.roi?.trend ?? "",
    demographics,
    campaigns: row.campaigns || [],
    history: row.history_projection || [],
    bestTimes: row.best_times || [],
    nextSteps: row.next_steps || [],
  };
}

function useReports(brandId, enabled) {
  return useQuery({
    queryKey: ["reports", brandId],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reports")
        .select("id, title, period_label, top_metrics, demographics, campaigns, history_projection, best_times, next_steps, created_at")
        .eq("brand_id", brandId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data.map(mapReportRow);
    },
  });
}

function useAddReport(brandId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ title }) => {
      const { data, error } = await supabase
        .from("reports")
        .insert({
          brand_id: brandId,
          title,
          period_label: title,
          top_metrics: {
            reach: { value: "0", trend: "+0%" },
            engagement: { value: "0%", trend: "+0pp" },
            conversions: { value: "0", trend: "+0%" },
            roi: { value: "0%", trend: "+0%" },
          },
          demographics: {
            idade: [{ label: "18-24", pct: 0 }, { label: "25-34", pct: 0 }, { label: "35-44", pct: 0 }, { label: "45-54", pct: 0 }, { label: "55+", pct: 0 }],
            genero: [{ label: "Feminino", pct: 0 }, { label: "Masculino", pct: 0 }, { label: "Outro", pct: 0 }],
            local: [{ label: "Local principal", pct: 0 }, { label: "Outros", pct: 0 }],
          },
          campaigns: [],
          history_projection: [{ month: "Mês 1", real: 0, proj: 0 }],
          best_times: [],
          next_steps: [{ text: "Definir o primeiro próximo passo", done: false }],
        })
        .select()
        .single();
      if (error) throw error;
      return mapReportRow(data);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["reports", brandId] }),
  });
}

function useSaveNextSteps(brandId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, nextSteps }) => {
      const { error } = await supabase.from("reports").update({ next_steps: nextSteps }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["reports", brandId] }),
  });
}

/* ---------------------------------------------------------
   CRONOGRAMA DE STORIES — ligação ao Supabase (story_week_plans)
--------------------------------------------------------- */
function mondayOfCurrentWeek() {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  return monday.toISOString().slice(0, 10);
}

function useStoryWeekPlan(brandId, enabled) {
  return useQuery({
    queryKey: ["story_week_plan", brandId],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("story_week_plans")
        .select("id, week_start_date, objective, days")
        .eq("brand_id", brandId)
        .order("week_start_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) return { id: null, objective: "", days: {} };
      return { id: data.id, objective: data.objective || "", days: data.days || {} };
    },
  });
}

function useSaveStoryWeekPlan(brandId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, objective, days }) => {
      if (id) {
        const { error } = await supabase.from("story_week_plans").update({ objective, days }).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("story_week_plans")
          .insert({ brand_id: brandId, week_start_date: mondayOfCurrentWeek(), objective, days });
        if (error) throw error;
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["story_week_plan", brandId] }),
  });
}
const STORY_CHECKLIST = [
  { group: "Formato natural da marca", items: ["Existe um formato que mais gosta de produzir?", "A audiência entende e reage a esse formato?", "Testa outros formatos de story?"] },
  { group: "Comportamento da audiência", items: ["Retenção: Alta", "Respostas: Frequentes"] },
  { group: "Intenção", items: ["Aproximar", "Engajar"] },
];

const CONTENT_IDEA_TYPES = ["Carrossel", "Reel", "Post", "Story"];
const TIMING_OPTIONS = ["Início do mês", "Meio do mês", "Fim do mês", "Data específica"];

/* ---------------------------------------------------------
   CRONOGRAMA DE CONTEÚDOS — ligação ao Supabase (content_schedules)
--------------------------------------------------------- */
function mapScheduleRow(row) {
  return {
    id: row.id,
    title: row.title,
    focus: row.focus || "",
    specificActions: row.specific_actions || [],
    weeks: row.weeks || [],
  };
}

function useContentSchedules(brandId, enabled) {
  return useQuery({
    queryKey: ["content_schedules", brandId],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("content_schedules")
        .select("id, title, focus, specific_actions, weeks, created_at")
        .eq("brand_id", brandId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data.map(mapScheduleRow);
    },
  });
}

function useAddContentSchedule(brandId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ title }) => {
      const base = Date.now();
      const { data, error } = await supabase
        .from("content_schedules")
        .insert({
          brand_id: brandId,
          title,
          focus: "",
          specific_actions: [],
          weeks: [
            { id: base + 1, label: "Semana 1", action: "", contentIdeas: [] },
            { id: base + 2, label: "Semana 2", action: "", contentIdeas: [] },
            { id: base + 3, label: "Semana 3", action: "", contentIdeas: [] },
            { id: base + 4, label: "Semana 4", action: "", contentIdeas: [] },
          ],
        })
        .select()
        .single();
      if (error) throw error;
      return mapScheduleRow(data);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["content_schedules", brandId] }),
  });
}

function useSaveContentSchedule(brandId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (schedule) => {
      const { error } = await supabase
        .from("content_schedules")
        .update({ title: schedule.title, focus: schedule.focus, specific_actions: schedule.specificActions, weeks: schedule.weeks })
        .eq("id", schedule.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["content_schedules", brandId] }),
  });
}

function useDeleteContentSchedule(brandId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from("content_schedules").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["content_schedules", brandId] }),
  });
}

/* ---------------------------------------------------------
   PROPOSTAS — ligação ao Supabase (tabela proposals)
--------------------------------------------------------- */
function slugify(text) {
  return (text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function mapProposalRow(row) {
  return {
    id: row.id,
    clientName: row.client_name,
    slug: row.slug,
    status: row.status,
    approvalStatus: row.approval_status,
    clientNote: row.client_note || "",
    brandingColor: row.branding_color || c.boss,
    phases: row.phases || [],
    aiGenerated: row.ai_generated,
  };
}

function useProposals(enabled) {
  return useQuery({
    queryKey: ["proposals"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("proposals")
        .select("id, client_name, slug, status, approval_status, client_note, branding_color, phases, ai_generated, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data.map(mapProposalRow);
    },
  });
}

function useAddProposal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ session, clientName, brandingColor, phases, aiGenerated }) => {
      const agencyId = await resolveDefaultAgencyId(session);
      const slug = `${slugify(clientName) || "cliente"}-${Date.now()}`;
      const { data, error } = await supabase
        .from("proposals")
        .insert({ agency_id: agencyId, client_name: clientName, slug, branding_color: brandingColor, phases, ai_generated: !!aiGenerated })
        .select()
        .single();
      if (error) throw error;
      return mapProposalRow(data);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["proposals"] }),
  });
}

function useUpdateProposal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (proposal) => {
      const { error } = await supabase
        .from("proposals")
        .update({ client_name: proposal.clientName, status: proposal.status, branding_color: proposal.brandingColor, phases: proposal.phases })
        .eq("id", proposal.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["proposals"] }),
  });
}

function useDeleteProposal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from("proposals").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["proposals"] }),
  });
}

/* ---------------------------------------------------------
   MINHAS TAREFAS — ligação ao Supabase (personal_tasks, só admin_geral)
--------------------------------------------------------- */
function mapPersonalTaskRow(row) {
  return { id: row.id, text: row.title, done: !!row.completed };
}

function usePersonalTasks(session, enabled) {
  return useQuery({
    queryKey: ["personal_tasks", session?.id],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("personal_tasks")
        .select("id, title, completed, sort_order")
        .eq("user_id", session.id)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data.map(mapPersonalTaskRow);
    },
  });
}

function useAddPersonalTask(session) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (text) => {
      const { error } = await supabase.from("personal_tasks").insert({ user_id: session.id, title: text, allocation_type: "sem_dia" });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["personal_tasks", session.id] }),
  });
}

function useTogglePersonalTask(session) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, done }) => {
      const { error } = await supabase.from("personal_tasks").update({ completed: done }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["personal_tasks", session.id] }),
  });
}

function useDeletePersonalTask(session) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from("personal_tasks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["personal_tasks", session.id] }),
  });
}

/* ---------------------------------------------------------
   REUNIÕES — ligação ao Supabase (tabela meetings)
--------------------------------------------------------- */
function mapMeetingRow(row) {
  return {
    id: row.id,
    personName: row.person_name || "",
    sector: row.sector || "",
    date: row.meeting_date || "",
    howArrived: row.how_arrived || "",
    relevantData: row.relevant_data || "",
    pdfUrl: row.pdf_url || null,
    pdfName: row.pdf_name || null,
    structure: row.structure || [],
    proposalNotes: row.proposal_notes || "",
  };
}

function useMeetings(enabled) {
  return useQuery({
    queryKey: ["meetings"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("meetings")
        .select("id, person_name, sector, meeting_date, how_arrived, relevant_data, pdf_url, pdf_name, structure, proposal_notes, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data.map(mapMeetingRow);
    },
  });
}

function useAddMeeting(session) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const agencyId = await resolveDefaultAgencyId(session);
      const { data, error } = await supabase
        .from("meetings")
        .insert({ agency_id: agencyId, created_by: session.id, person_name: "Nova reunião", structure: [] })
        .select()
        .single();
      if (error) throw error;
      return mapMeetingRow(data);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["meetings"] }),
  });
}

function useSaveMeeting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (meeting) => {
      const { error } = await supabase
        .from("meetings")
        .update({
          person_name: meeting.personName,
          sector: meeting.sector,
          meeting_date: meeting.date || null,
          how_arrived: meeting.howArrived,
          relevant_data: meeting.relevantData,
          pdf_url: meeting.pdfUrl,
          pdf_name: meeting.pdfName,
          structure: meeting.structure,
          proposal_notes: meeting.proposalNotes,
        })
        .eq("id", meeting.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["meetings"] }),
  });
}

function useDeleteMeeting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from("meetings").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["meetings"] }),
  });
}

async function uploadMeetingPdf(meetingId, file) {
  const path = `${meetingId}/${Date.now()}-${file.name}`;
  const { error } = await supabase.storage.from("meeting-files").upload(path, file, { upsert: true });
  if (error) throw error;
  const { data } = supabase.storage.from("meeting-files").getPublicUrl(path);
  return data.publicUrl;
}

function ReuniaoDetail({ meeting: initial, onBack }) {
  const [meeting, onChange] = useState(initial);
  const [newPoint, setNewPoint] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const saveMeeting = useSaveMeeting();
  const deleteMeeting = useDeleteMeeting();

  const updateField = (field, value) => { onChange((m) => ({ ...m, [field]: value })); setSaved(false); };

  const addPoint = () => {
    if (!newPoint.trim()) return;
    updateField("structure", [...meeting.structure, { text: newPoint.trim(), done: false }]);
    setNewPoint("");
  };
  const togglePoint = (i) => updateField("structure", meeting.structure.map((s, idx) => (idx === i ? { ...s, done: !s.done } : s)));
  const removePoint = (i) => updateField("structure", meeting.structure.filter((_, idx) => idx !== i));
  const movePoint = (i, dir) => {
    const swapWith = i + dir;
    if (swapWith < 0 || swapWith >= meeting.structure.length) return;
    const structure = [...meeting.structure];
    [structure[i], structure[swapWith]] = [structure[swapWith], structure[i]];
    updateField("structure", structure);
  };

  const onPdfSelected = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const url = await uploadMeetingPdf(meeting.id, file);
      onChange((m) => ({ ...m, pdfUrl: url, pdfName: file.name }));
      setSaved(false);
    } catch (err) {
      setError(err.message || "Não foi possível carregar o PDF.");
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    setError("");
    try {
      await saveMeeting.mutateAsync(meeting);
      setSaved(true);
    } catch (err) {
      setError(err.message || "Não foi possível guardar.");
    }
  };

  return (
    <div className="bb-page" style={{ padding: "8px 40px 60px", maxWidth: 800 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <button
          onClick={onBack}
          style={{ ...sans, display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: c.mist, background: "none", border: "none", cursor: "pointer" }}
        >
          <ArrowLeft size={14} /> Reuniões
        </button>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={save}
            disabled={saveMeeting.isPending}
            style={{ ...sans, fontSize: 12.5, fontWeight: 600, color: "#fff", background: c.boss, border: "none", borderRadius: 8, padding: "8px 16px", cursor: "pointer" }}
          >
            {saveMeeting.isPending ? "A guardar…" : "Guardar"}
          </button>
          <button
            onClick={() => deleteMeeting.mutate(meeting.id, { onSuccess: onBack })}
            style={{ ...sans, display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: c.rose, background: "none", border: `1px solid ${c.line}`, borderRadius: 8, padding: "7px 12px", cursor: "pointer" }}
          >
            <Trash2 size={13} /> Eliminar
          </button>
        </div>
      </div>

      <input
        value={meeting.personName}
        onChange={(e) => updateField("personName", e.target.value)}
        placeholder="Nome da pessoa"
        style={{ ...serif, fontSize: 24, color: c.ink, border: "none", outline: "none", background: "none", width: "100%", marginBottom: 18 }}
      />

      {error && <div style={{ ...sans, fontSize: 12, color: c.rose, marginBottom: 14 }}>{error}</div>}
      {saved && <div style={{ ...sans, fontSize: 12, color: c.sage, marginBottom: 14 }}>Alterações guardadas.</div>}

      <div style={{ display: "grid", gridTemplateColumns: "var(--bb-grid-2, 1fr 1fr)", gap: 14, marginBottom: 14 }}>
        <ChartCard title="Setor de atividade" sub="">
          <input
            value={meeting.sector}
            onChange={(e) => updateField("sector", e.target.value)}
            style={{ ...sans, width: "100%", fontSize: 13, border: `1px solid ${c.line}`, borderRadius: 8, padding: "9px 12px", outline: "none", color: c.ink }}
          />
        </ChartCard>
        <ChartCard title="Data da reunião" sub="">
          <input
            type="date"
            value={meeting.date}
            onChange={(e) => updateField("date", e.target.value)}
            style={{ ...sans, width: "100%", fontSize: 13, border: `1px solid ${c.line}`, borderRadius: 8, padding: "9px 12px", outline: "none", color: c.ink }}
          />
        </ChartCard>
      </div>

      <div style={{ marginBottom: 14 }}>
        <ChartCard title="Como chegou até mim" sub="">
          <textarea
            value={meeting.howArrived}
            onChange={(e) => updateField("howArrived", e.target.value)}
            rows={2}
            style={{ ...sans, width: "100%", fontSize: 13, border: `1px solid ${c.line}`, borderRadius: 8, padding: "9px 12px", outline: "none", color: c.ink, resize: "vertical" }}
          />
        </ChartCard>
      </div>

      <div style={{ marginBottom: 14 }}>
        <ChartCard title="Dados relevantes" sub="">
          <textarea
            value={meeting.relevantData}
            onChange={(e) => updateField("relevantData", e.target.value)}
            rows={3}
            style={{ ...sans, width: "100%", fontSize: 13, border: `1px solid ${c.line}`, borderRadius: 8, padding: "9px 12px", outline: "none", color: c.ink, resize: "vertical" }}
          />
        </ChartCard>
      </div>

      <div style={{ marginBottom: 14 }}>
        <ChartCard title="Documento (PDF)" sub="Ex: apresentação, dossier do prospect">
          <label
            style={{
              display: "flex", alignItems: "center", gap: 10, cursor: "pointer",
              border: `1.5px dashed ${c.line}`, borderRadius: 10, padding: "12px 14px",
            }}
          >
            <input type="file" accept="application/pdf" onChange={onPdfSelected} style={{ display: "none" }} />
            <FileText size={16} color={c.boss} />
            <span style={{ ...sans, fontSize: 12.5, color: c.ink }}>
              {uploading ? "A carregar…" : meeting.pdfName ? meeting.pdfName : "Carregar PDF"}
            </span>
          </label>
          {meeting.pdfUrl && (
            <a href={meeting.pdfUrl} target="_blank" rel="noreferrer" style={{ ...sans, fontSize: 11.5, color: c.boss, marginTop: 8, display: "inline-block" }}>
              Abrir ficheiro atual ↗
            </a>
          )}
        </ChartCard>
      </div>

      <div style={{ marginBottom: 14 }}>
        <ChartCard title="Estrutura da reunião" sub="Pontos e perguntas — marca durante a chamada">
          <div style={{ display: "flex", flexDirection: "column", gap: 2, marginBottom: 12 }}>
            {meeting.structure.map((s, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 4px" }}>
                <button
                  onClick={() => togglePoint(i)}
                  style={{ display: "flex", alignItems: "center", gap: 10, background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "left", flex: 1 }}
                >
                  {s.done ? (
                    <CheckCircle2 size={16} color={c.sage} strokeWidth={2} style={{ flexShrink: 0 }} />
                  ) : (
                    <span style={{ width: 16, height: 16, borderRadius: 999, border: `1.5px solid ${c.line}`, flexShrink: 0 }} />
                  )}
                  <span style={{ ...sans, fontSize: 13, color: s.done ? c.mist : c.ink, textDecoration: s.done ? "line-through" : "none" }}>
                    {s.text}
                  </span>
                </button>
                <button onClick={() => movePoint(i, -1)} disabled={i === 0} style={{ background: "none", border: "none", cursor: i === 0 ? "default" : "pointer", color: i === 0 ? c.line : c.mist, padding: 1 }}>
                  <ChevronUp size={13} />
                </button>
                <button onClick={() => movePoint(i, 1)} disabled={i === meeting.structure.length - 1} style={{ background: "none", border: "none", cursor: i === meeting.structure.length - 1 ? "default" : "pointer", color: i === meeting.structure.length - 1 ? c.line : c.mist, padding: 1 }}>
                  <ChevronDown size={13} />
                </button>
                <button onClick={() => removePoint(i)} style={{ background: "none", border: "none", cursor: "pointer", color: c.mist, padding: 1 }}>
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
            {meeting.structure.length === 0 && (
              <div style={{ ...sans, fontSize: 12.5, color: c.mistLight, padding: "6px 4px" }}>Ainda sem pontos.</div>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={newPoint}
              onChange={(e) => setNewPoint(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addPoint()}
              placeholder="Novo ponto/pergunta..."
              style={{ ...sans, flex: 1, fontSize: 12.5, border: `1px solid ${c.line}`, borderRadius: 8, padding: "8px 12px", outline: "none", color: c.ink }}
            />
            <button
              onClick={addPoint}
              style={{ width: 34, height: 34, borderRadius: 8, background: c.boss, border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}
            >
              <Plus size={15} color="#fff" />
            </button>
          </div>
        </ChartCard>
      </div>

      <ChartCard title="Notas de proposta" sub="Para propostas informais, fora do formato normal">
        <textarea
          value={meeting.proposalNotes}
          onChange={(e) => updateField("proposalNotes", e.target.value)}
          rows={4}
          style={{ ...sans, width: "100%", fontSize: 13, border: `1px solid ${c.line}`, borderRadius: 8, padding: "9px 12px", outline: "none", color: c.ink, resize: "vertical" }}
        />
      </ChartCard>
    </div>
  );
}

function ReunioesModule({ session }) {
  const [openId, setOpenId] = useState(null);
  const meetingsQuery = useMeetings(true);
  const addMeeting = useAddMeeting(session);
  const meetings = meetingsQuery.data || [];
  const meeting = meetings.find((m) => m.id === openId);

  const createMeeting = async () => {
    const newMeeting = await addMeeting.mutateAsync();
    setOpenId(newMeeting.id);
  };

  if (meeting) {
    return <ReuniaoDetail meeting={meeting} onBack={() => setOpenId(null)} />;
  }

  return (
    <div className="bb-page" style={{ padding: "8px 40px 60px", maxWidth: 1040 }}>
      <Eyebrow>Reuniões</Eyebrow>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <h1 style={{ ...serif, fontSize: 30, fontWeight: 500, color: c.ink, margin: 0 }}>Preparação de reuniões</h1>
        <button
          onClick={createMeeting}
          disabled={addMeeting.isPending}
          style={{
            ...sans, display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, color: "#fff",
            background: c.boss, border: "none", borderRadius: 8, padding: "9px 16px", cursor: "pointer",
          }}
        >
          <Plus size={14} /> {addMeeting.isPending ? "A criar…" : "Nova reunião"}
        </button>
      </div>
      <div style={{ ...sans, fontSize: 12.5, color: c.mist, marginBottom: 20, maxWidth: 600, lineHeight: 1.6 }}>
        Ferramenta interna — prepara aqui uma ficha por reunião com um prospect ou cliente, consulta durante a chamada, e apaga depois se não precisares de guardar.
      </div>

      {meetingsQuery.isLoading && <div style={{ ...sans, fontSize: 13, color: c.mist }}>A carregar…</div>}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {meetings.map((m) => {
          const doneCount = m.structure.filter((s) => s.done).length;
          return (
            <div
              key={m.id}
              onClick={() => setOpenId(m.id)}
              style={{ display: "flex", alignItems: "center", gap: 14, background: "#fff", border: `1px solid ${c.line}`, borderRadius: 12, padding: "14px 18px", cursor: "pointer" }}
            >
              <div style={{ width: 34, height: 34, borderRadius: 9, background: c.bossSoft, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Handshake size={16} color={c.boss} strokeWidth={1.8} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ ...serif, fontSize: 15, color: c.ink, fontWeight: 500 }}>{m.personName || "Sem nome"}</div>
                <div style={{ ...sans, fontSize: 11.5, color: c.mist, marginTop: 2 }}>
                  {[m.sector, m.date].filter(Boolean).join(" · ") || "Sem detalhes"}
                  {m.structure.length > 0 && ` · ${doneCount}/${m.structure.length} pontos`}
                </div>
              </div>
              <ChevronRight size={16} color={c.mist} />
            </div>
          );
        })}
        {!meetingsQuery.isLoading && meetings.length === 0 && (
          <div style={{ ...sans, fontSize: 13, color: c.mistLight, textAlign: "center", padding: "40px 0" }}>
            Ainda sem reuniões — cria a primeira acima.
          </div>
        )}
      </div>
    </div>
  );
}

const CALENDAR_DAYS = [
  { day: 29, month: "jun", events: [{ label: "Stories Harmoniae", color: c.boss }, { label: "Leads Dreams", color: c.amber }] },
  { day: 30, month: "jun", events: [{ label: "Análise Tráfego", color: c.rose }, { label: "Blogs", color: "#3B5FC2" }] },
  { day: 1, month: "jul", events: [{ label: "Stories Harmoniae", color: c.boss }, { label: "Leads Dreams", color: c.amber }] },
  { day: 2, month: "jul", events: [{ label: "Stories Empower", color: c.boss }] },
  { day: 3, month: "jul", events: [{ label: "Stories Harmoniae", color: c.boss }, { label: "Leads Dreams", color: c.amber }] },
  { day: 4, month: "jul", events: [{ label: "Análise Tráfego", color: c.rose }], band: "Gravações" },
  { day: 5, month: "jul", events: [{ label: "Stories Harmoniae", color: c.boss }] },
  { day: 6, month: "jul", events: [{ label: "Stories Harmoniae", color: c.boss }] },
  { day: 7, month: "jul", events: [{ label: "Análise Tráfego", color: c.rose }, { label: "Blogs", color: "#3B5FC2" }] },
  { day: 8, month: "jul", events: [{ label: "Stories Harmoniae", color: c.boss }] },
  { day: 9, month: "jul", events: [{ label: "Stories Empower", color: c.boss }] },
  { day: 10, month: "jul", events: [{ label: "Stories Harmoniae", color: c.boss }] },
  { day: 11, month: "jul", events: [{ label: "Análise Tráfego", color: c.rose }], band: "Estratégias" },
  { day: 12, month: "jul", events: [{ label: "Stories Harmoniae", color: c.boss }] },
];
const CALENDAR_LEGEND = [
  { label: "Stories", color: c.boss },
  { label: "Leads / Prospeção", color: c.amber },
  { label: "Tráfego pago", color: c.rose },
  { label: "Blogs", color: "#3B5FC2" },
];

const PERSONAL_PENDING = [
  { id: 1, text: "Colocar Despesas e Receita no Excel", tag: "4ª Semana", color: "#FBE0E4" },
  { id: 2, text: "Rever roteiros da próxima semana", tag: "3ª Semana", color: "#FBF3D6" },
  { id: 3, text: "Atualizar Base de Conhecimento — Prospeção", tag: "2ª Semana", color: "#E4EAFB" },
  { id: 4, text: "Preparar gravações do mês", tag: "1ª Semana", color: "#DFF5EA" },
];

const PERSONAL_BY_DAY = [
  { day: "Segunda", tasks: ["Stories Harmoniae | Empower | Bia | Academy", "Colocar Novos Leads Dreams"] },
  { day: "Terça", tasks: ["Análise de Tráfego Pago", "Blogs", "Stories Astredik | Dreams Studio | Academy"] },
  { day: "Quarta", tasks: ["Stories Harmoniae | Bia | Academy"] },
];

/* ---------------------------------------------------------
   BASE DE CONHECIMENTO — ligação ao Supabase (knowledge_articles)
--------------------------------------------------------- */
function mapArticleRow(row) {
  return { id: row.id, title: row.title, category: row.category || "SOP", steps: row.steps || [] };
}

function useArticles(enabled) {
  return useQuery({
    queryKey: ["knowledge_articles"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("knowledge_articles")
        .select("id, title, category, steps, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data.map(mapArticleRow);
    },
  });
}

function useAddArticle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ session, title }) => {
      const agencyId = await resolveDefaultAgencyId(session);
      const { data, error } = await supabase
        .from("knowledge_articles")
        .insert({ agency_id: agencyId, title, category: "SOP", steps: ["Primeiro passo deste processo."] })
        .select()
        .single();
      if (error) throw error;
      return mapArticleRow(data);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["knowledge_articles"] }),
  });
}

function useDeleteArticle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from("knowledge_articles").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["knowledge_articles"] }),
  });
}

const SLIDE_LAYOUTS = [
  { key: "title", label: "Título", icon: FileText },
  { key: "stat", label: "Estatística", icon: TrendingUp },
  { key: "quote", label: "Citação", icon: Sparkles },
  { key: "image", label: "Imagem", icon: ImageIcon },
  { key: "video", label: "Vídeo", icon: Video },
  { key: "split", label: "Duas colunas", icon: Layers },
];

/* ---------------------------------------------------------
   PORTFÓLIO — ligação ao Supabase (tabela presentations)
--------------------------------------------------------- */
function mapDeckRow(row) {
  return {
    id: row.id,
    title: row.title,
    brandingColor: row.branding_color || c.boss,
    slides: row.slides || [],
    approvalStatus: row.approval_status,
    clientNote: row.client_note || "",
  };
}

function useDecks(enabled) {
  return useQuery({
    queryKey: ["presentations"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("presentations")
        .select("id, title, branding_color, slides, approval_status, client_note, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data.map(mapDeckRow);
    },
  });
}

function useAddDeck() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ session, title, brandingColor, slides }) => {
      const agencyId = await resolveDefaultAgencyId(session);
      const { data, error } = await supabase
        .from("presentations")
        .insert({ agency_id: agencyId, title, branding_color: brandingColor, slides })
        .select()
        .single();
      if (error) throw error;
      return mapDeckRow(data);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["presentations"] }),
  });
}

function useUpdateDeck() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (deck) => {
      const { error } = await supabase
        .from("presentations")
        .update({ title: deck.title, branding_color: deck.brandingColor, slides: deck.slides })
        .eq("id", deck.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["presentations"] }),
  });
}

function useDeleteDeck() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from("presentations").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["presentations"] }),
  });
}

async function uploadPortfolioImage(deckId, file) {
  const ext = file.name.split(".").pop();
  const path = `${deckId}/slide-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("portfolio-media").upload(path, file, { upsert: true });
  if (error) throw error;
  const { data } = supabase.storage.from("portfolio-media").getPublicUrl(path);
  return data.publicUrl;
}

/* ---------------------------------------------------------
   LINK NA BIO — ligação ao Supabase (tabela link_pages)
   Uma página por agência, para já (sem seletor de várias páginas
   na UI original).
--------------------------------------------------------- */
const DEFAULT_LINK_BG = {
  type: "gradient",
  gradientFrom: c.boss,
  gradientTo: c.bossDeep,
  gradientAngle: 160,
  colorValue: c.boss,
  photoUrl: null,
  overlay: { enabled: true, direction: "180deg", color: "#000000", intensity: 55 },
};

function mapLinkPageRow(row, ownerName, agencyId) {
  return {
    id: row.id,
    agencyId,
    ownerName,
    slug: row.slug,
    about: row.about_text || "",
    avatarUrl: row.profile_photo_url,
    avatarBgRemoved: !!row.background_removed,
    bg: row.background_style && Object.keys(row.background_style).length ? row.background_style : DEFAULT_LINK_BG,
    blocks: row.blocks || [],
    quizEnabled: !!(row.quiz && row.quiz.enabled),
  };
}

function useLinkPage(session, enabled) {
  return useQuery({
    queryKey: ["link_page", session?.agency_id, session?.id],
    enabled,
    queryFn: async () => {
      const agencyId = await resolveDefaultAgencyId(session);
      const { data: agency } = await supabase.from("agencies").select("name").eq("id", agencyId).single();
      const { data, error } = await supabase
        .from("link_pages")
        .select("id, slug, about_text, profile_photo_url, background_removed, background_style, blocks, quiz")
        .eq("owner_type", "agency")
        .eq("owner_id", agencyId)
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        return {
          id: null,
          agencyId,
          ownerName: agency.name,
          slug: slugify(agency.name) || "pagina",
          about: "",
          avatarUrl: null,
          avatarBgRemoved: false,
          bg: DEFAULT_LINK_BG,
          blocks: [],
          quizEnabled: false,
        };
      }
      return mapLinkPageRow(data, agency.name, agencyId);
    },
  });
}

function useSaveLinkPage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (page) => {
      const payload = {
        owner_type: "agency",
        owner_id: page.agencyId,
        slug: page.slug,
        about_text: page.about,
        profile_photo_url: page.avatarUrl,
        background_removed: page.avatarBgRemoved,
        background_style: page.bg,
        blocks: page.blocks,
        quiz: { enabled: page.quizEnabled },
      };
      if (page.id) {
        const { data, error } = await supabase.from("link_pages").update(payload).eq("id", page.id).select().single();
        if (error) throw error;
        return data.id;
      }
      const { data, error } = await supabase.from("link_pages").insert(payload).select().single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["link_page"] }),
  });
}

async function uploadLinkMedia(agencyId, file, prefix) {
  const ext = file.name.split(".").pop();
  const path = `${agencyId}/${prefix}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("link-media").upload(path, file, { upsert: true });
  if (error) throw error;
  const { data } = supabase.storage.from("link-media").getPublicUrl(path);
  return data.publicUrl;
}

const GRADIENT_SWATCH_PAIRS = [
  [c.boss, c.bossDeep],
  ["#2F9E63", "#1C6B44"],
  ["#1C1526", "#3A2E52"],
  ["#C9821F", "#8A5610"],
  ["#D3455B", "#8A1F31"],
  ["#3B5FC2", "#1E3373"],
];

const SOCIAL_PLATFORMS = [
  { key: "instagram", label: "Instagram", icon: Instagram },
  { key: "facebook", label: "Facebook", icon: Facebook },
  { key: "tiktok", label: "TikTok", icon: Music2 },
  { key: "youtube", label: "YouTube", icon: Youtube },
  { key: "whatsapp", label: "WhatsApp", icon: MessageCircle },
];

const BLOCK_TYPES = [
  { type: "social", label: "Redes sociais", icon: Instagram },
  { type: "link", label: "Link simples", icon: Link2 },
  { type: "video", label: "Vídeo com miniatura", icon: Video },
  { type: "product", label: "Produto", icon: FileText },
  { type: "podcast", label: "Podcast", icon: Sparkles },
];

const PRICING_TYPES = [
  {
    key: "servico_hora",
    label: "Serviço por Hora/Consulta",
    desc: "Consultas, sessões, trabalho cobrado pelo tempo — ex: manicure, consulta, aula.",
    icon: Clock,
  },
  {
    key: "produto_fisico",
    label: "Produto Físico",
    desc: "Itens produzidos em lote, com materiais e mão de obra — ex: roupa, velas, comida.",
    icon: FileText,
  },
  {
    key: "pacote_projeto",
    label: "Pacote / Projeto",
    desc: "Âmbito fechado com vários entregáveis e preço fixo — ex: rebranding, website.",
    icon: Layers,
  },
  {
    key: "recorrente",
    label: "Serviço Recorrente",
    desc: "Assinatura ou mensalidade — ex: gestão de redes sociais, manutenção.",
    icon: Calendar,
  },
];

/* ---------------------------------------------------------
   CALCULADORA — ligação ao Supabase (pricing_calculations)
--------------------------------------------------------- */
const PRICING_INPUT_KEYS = {
  servico_hora: ["hoursPerSession", "hourlyRate"],
  produto_fisico: ["quantity"],
  pacote_projeto: ["hourlyRate"],
  recorrente: ["setupCost", "amortizeMonths"],
};

function extractPricingInputs(product) {
  const keys = PRICING_INPUT_KEYS[product.type] || [];
  const inputs = {};
  keys.forEach((k) => { inputs[k] = product[k]; });
  return inputs;
}

function mapProductRow(row) {
  return {
    id: row.id,
    type: row.pricing_type,
    name: row.name,
    marginPct: row.margin_pct,
    exclusivity: row.exclusivity,
    currentPrice: row.current_price_practiced != null ? String(row.current_price_practiced) : "",
    costLines: row.cost_lines || [],
    deliverables: row.deliverables || [],
    ...(row.inputs || {}),
  };
}

function useProducts(session, enabled) {
  return useQuery({
    queryKey: ["pricing_calculations", session?.agency_id, session?.id],
    enabled,
    queryFn: async () => {
      const agencyId = await resolveDefaultAgencyId(session);
      const { data, error } = await supabase
        .from("pricing_calculations")
        .select("id, pricing_type, name, inputs, cost_lines, deliverables, margin_pct, exclusivity, current_price_practiced, created_at")
        .eq("agency_id", agencyId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data.map(mapProductRow);
    },
  });
}

function useAddProduct(session) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (product) => {
      const agencyId = await resolveDefaultAgencyId(session);
      const { data, error } = await supabase
        .from("pricing_calculations")
        .insert({
          agency_id: agencyId,
          pricing_type: product.type,
          name: product.name,
          inputs: extractPricingInputs(product),
          cost_lines: product.costLines,
          deliverables: product.deliverables || [],
          margin_pct: product.marginPct,
          exclusivity: product.exclusivity,
          current_price_practiced: product.currentPrice ? parseFloat(product.currentPrice) : null,
        })
        .select()
        .single();
      if (error) throw error;
      return mapProductRow(data);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pricing_calculations"] }),
  });
}

function useSaveProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (product) => {
      const { error } = await supabase
        .from("pricing_calculations")
        .update({
          name: product.name,
          inputs: extractPricingInputs(product),
          cost_lines: product.costLines,
          deliverables: product.deliverables || [],
          margin_pct: product.marginPct,
          exclusivity: product.exclusivity,
          current_price_practiced: product.currentPrice ? parseFloat(product.currentPrice) : null,
        })
        .eq("id", product.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pricing_calculations"] }),
  });
}

function useDeleteProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from("pricing_calculations").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pricing_calculations"] }),
  });
}

/* ---------------------------------------------------------
   EQUIPA — ligação ao Supabase (tabela profiles)
   Não é possível criar contas de login a partir do browser (isso
   exige a chave de administração do Supabase, que nunca deve andar
   no frontend) — por isso "convidar" mostra os passos manuais em
   vez de fingir criar a conta.
--------------------------------------------------------- */
function computeMemberScope(row) {
  if (row.role === "admin_geral") return "Acesso total";
  if (row.agencies?.name) return row.agencies.name;
  if (row.brand_ids && row.brand_ids.length) return `${row.brand_ids.length} marca${row.brand_ids.length > 1 ? "s" : ""}`;
  return "Sem âmbito definido";
}

function mapMemberRow(row) {
  const roleInfo = ROLES.find((r) => r.key === row.role);
  return {
    id: row.id,
    name: row.name || row.email || "Sem nome",
    email: row.email,
    role: roleInfo ? roleInfo.label : row.role,
    scope: computeMemberScope(row),
    initial: (row.name || row.email || "?").charAt(0).toUpperCase(),
  };
}

function useTeamMembers(enabled) {
  return useQuery({
    queryKey: ["team_members"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, name, email, role, agency_id, brand_ids, agencies(name)")
        .order("name");
      if (error) throw error;
      return data.map(mapMemberRow);
    },
  });
}

function useRenameMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, name }) => {
      const { error } = await supabase.from("profiles").update({ name }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["team_members"] }),
  });
}

function useRemoveMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from("profiles").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["team_members"] }),
  });
}

const MODULES = [
  { key: "brand-book", label: "Brand Book", sub: "Identidade visual e diretrizes", icon: BookOpen },
  { key: "conteudos", label: "Conteúdos", sub: "Posts e reels — aprovação", icon: FileText },
  { key: "cronograma-conteudos", label: "Cronograma de Conteúdos", sub: "Planeamento do que vai sair", icon: Calendar },
  { key: "roteiros", label: "Roteiros", sub: "Roteiros de vídeo", icon: ClipboardList },
  { key: "stories", label: "Cronograma de Stories", sub: "Planeamento semanal", icon: Video },
  { key: "plano", label: "Plano Estratégico", sub: "Fases e tarefas", icon: Layers },
  { key: "dashboards", label: "Dashboards", sub: "Performance da marca", icon: BarChart3 },
];

const NAV = [
  { key: "painel", label: "Painel Global", icon: LayoutGrid },
  { key: "marcas", label: "Marcas", icon: Briefcase },
  { key: "reunioes", label: "Reuniões", icon: Handshake },
  { key: "propostas", label: "Propostas", icon: FileText },
  { key: "portfolio", label: "Portfólio", icon: Layers },
  { key: "link", label: "Link na Bio", icon: Link2 },
  { key: "precificacao", label: "Calculadora", icon: Calculator },
  { key: "centro", label: "Centro de Comando", icon: Calendar },
  { key: "conhecimento", label: "Base de Conhecimento", icon: BookMarked },
  { key: "equipa", label: "Equipa", icon: Users },
  { key: "definicoes", label: "Definições", icon: Settings },
];

// O que cada perfil pode ver na navegação principal. "all" = acesso total.
// Perfis de cliente (aprovador) só veem a marca deles e a base de conhecimento —
// nunca a lista de agências, equipa interna, propostas ou ferramentas de gestão.
const NAV_ACCESS = {
  admin_geral: "all",
  membro: ["painel", "marcas", "reunioes", "propostas", "portfolio", "link", "precificacao", "centro", "conhecimento", "equipa"],
  agencia_admin: ["painel", "marcas", "reunioes", "propostas", "portfolio", "link", "precificacao", "centro", "conhecimento", "equipa", "definicoes"],
  agencia_membro: ["painel", "marcas", "reunioes", "propostas", "portfolio", "link", "precificacao", "centro", "conhecimento"],
  aprovador_marca: ["painel", "marcas", "conhecimento"],
  agencia_aprovador: ["painel", "marcas", "conhecimento"],
};
function visibleNav(role) {
  const allowed = NAV_ACCESS[role];
  if (!allowed || allowed === "all") return NAV;
  return NAV.filter((n) => allowed.includes(n.key));
}

/* ---------------------------------------------------------
   COMPONENTES BASE
--------------------------------------------------------- */
function StatusDot({ status }) {
  const map = { green: c.sage, yellow: c.amber, red: c.rose };
  return (
    <span
      style={{
        width: 7,
        height: 7,
        borderRadius: 999,
        background: map[status] || c.mist,
        display: "inline-block",
      }}
    />
  );
}

function Eyebrow({ children }) {
  return (
    <div
      style={{
        ...sans,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        color: c.boss,
        marginBottom: 8,
      }}
    >
      {children}
    </div>
  );
}

function Sidebar({ active, onNavigate, session, roleInfo, onLogout }) {
  return (
    <div
      className="bb-sidebar"
      style={{
        width: 240,
        minHeight: "100vh",
        background: c.sidebarBg,
        borderRight: `1px solid ${c.line}`,
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
      }}
    >
      <div className="bb-sidebar-logo" style={{ padding: "26px 22px 18px", display: "flex", alignItems: "center", gap: 9 }}>
        <div
          style={{
            width: 30,
            height: 30,
            borderRadius: 9,
            background: `linear-gradient(135deg, ${c.boss}, ${c.bossDeep})`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Sparkles size={15} color="#fff" strokeWidth={2} />
        </div>
        <div>
          <div style={{ ...serif, color: c.ink, fontSize: 17, fontWeight: 600, lineHeight: 1.1 }}>
            Big Boss
          </div>
          <div style={{ ...sans, color: c.mistLight, fontSize: 10, letterSpacing: "0.1em", marginTop: 1 }}>
            BIAMELO
          </div>
        </div>
      </div>
      <div className="bb-sidebar-nav" style={{ flex: 1, padding: "8px 12px", overflowY: "auto" }}>
        {visibleNav(session.role).map((item) => {
          const isActive = active === item.key;
          const Icon = item.icon;
          return (
            <button
              key={item.key}
              className="bb-sidebar-nav-item"
              onClick={() => onNavigate(item.key)}
              style={{
                ...sans,
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 12px",
                marginBottom: 2,
                borderRadius: 8,
                border: "none",
                cursor: "pointer",
                fontSize: 13.5,
                fontWeight: 500,
                textAlign: "left",
                color: isActive ? c.boss : c.mist,
                background: isActive ? c.bossSoft : "transparent",
              }}
            >
              <Icon size={16} strokeWidth={1.8} />
              {item.label}
            </button>
          );
        })}
      </div>
      <div className="bb-sidebar-footer" style={{ padding: 16, borderTop: `1px solid ${c.line}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: 999,
              background: c.bossSoft,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: c.boss,
              fontSize: 12,
              fontWeight: 600,
              ...sans,
              flexShrink: 0,
            }}
          >
            {(session.email || "?").charAt(0).toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ ...sans, color: c.ink, fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {roleInfo.label}
            </div>
            <div style={{ ...sans, color: c.mistLight, fontSize: 10.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {session.email}
            </div>
          </div>
          <button
            onClick={onLogout}
            title="Sair"
            style={{ background: "none", border: "none", cursor: "pointer", color: c.mist, flexShrink: 0, padding: 4 }}
          >
            <XCircle size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

const MOCK_NOTIFICATIONS = [
  { id: 1, text: "Harmoniae Aesthetics — houve atividade em Conteúdos", time: "há 12 min" },
  { id: 2, text: "Luxe Atelier — roteiro reprovado com nota", time: "há 2h" },
  { id: 3, text: "Astredik Studio — nova meta concluída no Plano Estratégico", time: "ontem" },
];

function TopBar({ onLogout }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bb-topbar" style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, padding: "18px 40px 0", position: "relative" }}>
      <button
        onClick={onLogout}
        title="Sair"
        className="bb-topbar-logout"
        style={{
          width: 34, height: 34, borderRadius: 999, border: `1px solid ${c.line}`, background: "#fff",
          display: "none", alignItems: "center", justifyContent: "center", cursor: "pointer",
        }}
      >
        <XCircle size={15} color={c.mist} strokeWidth={1.8} />
      </button>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: 34, height: 34, borderRadius: 999, border: `1px solid ${c.line}`, background: "#fff",
          display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", position: "relative",
        }}
      >
        <Bell size={15} color={c.mist} strokeWidth={1.8} />
        <span style={{ position: "absolute", top: 6, right: 7, width: 6, height: 6, borderRadius: 999, background: c.rose }} />
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
          <div
            style={{
              position: "absolute", top: 44, right: 40, width: 300, background: "#fff", border: `1px solid ${c.line}`,
              borderRadius: 14, boxShadow: "0 12px 30px rgba(23,21,31,0.14)", zIndex: 41, overflow: "hidden",
            }}
          >
            <div style={{ ...sans, fontSize: 11.5, fontWeight: 700, color: c.ink, padding: "12px 16px", borderBottom: `1px solid ${c.line}` }}>
              Notificações
            </div>
            {MOCK_NOTIFICATIONS.map((n) => (
              <div key={n.id} style={{ padding: "12px 16px", borderBottom: `1px solid ${c.line}` }}>
                <div style={{ ...sans, fontSize: 12.5, color: c.ink, lineHeight: 1.5 }}>{n.text}</div>
                <div style={{ ...sans, fontSize: 10.5, color: c.mistLight, marginTop: 3 }}>{n.time}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ---------------------------------------------------------
   PAINEL GLOBAL
--------------------------------------------------------- */
function PainelGlobal({ brands, onOpenBrand, onNavigate }) {
  const stats = [
    { label: "Marcas ativas", value: String(brands.length) },
    { label: "Tarefas hoje", value: "5" },
    { label: "Notificações por ler", value: "2" },
  ];
  return (
    <div className="bb-page" style={{ padding: "8px 40px 60px", maxWidth: 1040 }}>
      <Eyebrow>Painel Global</Eyebrow>
      <h1 style={{ ...serif, fontSize: 34, fontWeight: 500, color: c.ink, margin: "0 0 32px" }}>
        Bom dia, Bia.
      </h1>

      <div style={{ display: "grid", gridTemplateColumns: "var(--bb-grid-3, repeat(3, 1fr))", gap: 14, marginBottom: 40 }}>
        {stats.map((s) => (
          <div
            key={s.label}
            style={{
              background: "#fff",
              border: `1px solid ${c.line}`,
              borderRadius: 14,
              padding: "20px 22px",
            }}
          >
            <div style={{ ...serif, fontSize: 30, color: c.ink, fontWeight: 500 }}>{s.value}</div>
            <div style={{ ...sans, fontSize: 12.5, color: c.mist, marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <h2 style={{ ...serif, fontSize: 19, color: c.ink, fontWeight: 500, margin: 0 }}>As tuas marcas</h2>
        <button
          onClick={() => onNavigate("marcas")}
          style={{
            ...sans,
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 12.5,
            fontWeight: 600,
            color: c.boss,
            background: "none",
            border: "none",
            cursor: "pointer",
          }}
        >
          Ver todas <ChevronRight size={14} />
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "var(--bb-grid-3, repeat(3, 1fr))", gap: 14 }}>
        {brands.map((b) => (
          <button
            key={b.id}
            onClick={() => onOpenBrand(b.id)}
            style={{
              textAlign: "left",
              background: "#fff",
              border: `1px solid ${c.line}`,
              borderRadius: 14,
              padding: 20,
              cursor: "pointer",
            }}
          >
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                background: `linear-gradient(135deg, ${c.boss}, ${c.bossDeep})`,
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                ...serif,
                fontSize: 16,
                marginBottom: 14,
              }}
            >
              {b.initial}
            </div>
            <div style={{ ...serif, fontSize: 16, color: c.ink, fontWeight: 500 }}>{b.name}</div>
            <div style={{ ...sans, fontSize: 12, color: c.mist, marginTop: 4, display: "flex", alignItems: "center", gap: 6 }}>
              <StatusDot status={b.status} /> {b.category}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
   LISTA DE MARCAS
--------------------------------------------------------- */
function MarcasList({ brands, onOpenBrand, onAddBrand, addBrandError, addingBrand }) {
  return (
    <div className="bb-page" style={{ padding: "8px 40px 60px", maxWidth: 1040 }}>
      <Eyebrow>Marcas</Eyebrow>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
        <h1 style={{ ...serif, fontSize: 30, fontWeight: 500, color: c.ink, margin: 0 }}>Todas as marcas</h1>
        <button
          onClick={onAddBrand}
          disabled={addingBrand}
          style={{
            ...sans,
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 13,
            fontWeight: 600,
            color: "#fff",
            background: c.boss,
            border: "none",
            borderRadius: 8,
            padding: "9px 16px",
            cursor: addingBrand ? "default" : "pointer",
            opacity: addingBrand ? 0.7 : 1,
          }}
        >
          <Plus size={14} /> {addingBrand ? "A criar…" : "Nova marca"}
        </button>
      </div>
      {addBrandError && (
        <div style={{ ...sans, fontSize: 12.5, color: c.rose, background: "#FBE9EC", borderRadius: 8, padding: "10px 14px", marginBottom: 18 }}>
          {addBrandError}
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {brands.map((b) => (
          <button
            key={b.id}
            onClick={() => onOpenBrand(b.id)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 16,
              textAlign: "left",
              background: "#fff",
              border: `1px solid ${c.line}`,
              borderRadius: 12,
              padding: "14px 18px",
              cursor: "pointer",
            }}
          >
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                background: `linear-gradient(135deg, ${c.boss}, ${c.bossDeep})`,
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                ...serif,
                fontSize: 17,
                flexShrink: 0,
              }}
            >
              {b.initial}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ ...serif, fontSize: 15.5, color: c.ink, fontWeight: 500 }}>{b.name}</div>
              <div style={{ ...sans, fontSize: 12, color: c.mist, marginTop: 2 }}>{b.category}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, ...sans, fontSize: 12, color: c.mist }}>
              <StatusDot status={b.status} />
              {b.status === "green" ? "Saudável" : b.status === "yellow" ? "Atenção" : "Crítico"}
            </div>
            <ChevronRight size={16} color={c.mist} />
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
   DETALHE DA MARCA
--------------------------------------------------------- */
function MarcaDetail({ brand, onBack, sub, onOpenSub, session }) {
  if (sub === "conteudos") {
    return <ConteudosView brand={brand} onBack={() => onOpenSub(null)} session={session} />;
  }
  if (sub === "roteiros") {
    return <RoteirosView brand={brand} onBack={() => onOpenSub(null)} session={session} />;
  }
  if (sub === "plano") {
    return <PlanoEstrategicoView brand={brand} onBack={() => onOpenSub(null)} session={session} />;
  }
  if (sub === "dashboards") {
    return <DashboardsView brand={brand} onBack={() => onOpenSub(null)} session={session} />;
  }
  if (sub === "brand-book") {
    return <BrandBookView brand={brand} onBack={() => onOpenSub(null)} session={session} />;
  }
  if (sub === "stories") {
    return <StoriesView brand={brand} onBack={() => onOpenSub(null)} session={session} />;
  }
  if (sub === "cronograma-conteudos") {
    return <CronogramaConteudosView brand={brand} onBack={() => onOpenSub(null)} session={session} />;
  }
  return (
    <div className="bb-page" style={{ padding: "8px 40px 60px", maxWidth: 1040 }}>
      <button
        onClick={onBack}
        style={{
          ...sans,
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 12.5,
          color: c.mist,
          background: "none",
          border: "none",
          cursor: "pointer",
          marginBottom: 20,
        }}
      >
        <ArrowLeft size={14} /> Marcas
      </button>

      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 28 }}>
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: 12,
            background: `linear-gradient(135deg, ${c.boss}, ${c.bossDeep})`,
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            ...serif,
            fontSize: 20,
          }}
        >
          {brand.initial}
        </div>
        <div>
          <h1 style={{ ...serif, fontSize: 27, fontWeight: 500, color: c.ink, margin: 0 }}>{brand.name}</h1>
          <div style={{ ...sans, fontSize: 12.5, color: c.mist, display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
            <StatusDot status={brand.status} /> {brand.category}
          </div>
        </div>
      </div>

      {/* SIGNATURE: Objetivo em destaque */}
      <div
        style={{
          background: `linear-gradient(135deg, ${c.bossSoft} 0%, #FFFFFF 65%)`,
          border: `1px solid ${c.line}`,
          borderRadius: 16,
          padding: "28px 32px",
          marginBottom: 32,
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            bottom: 0,
            width: 3,
            background: `linear-gradient(180deg, ${c.boss}, ${c.bossDeep})`,
          }}
        />
        <div style={{ ...sans, fontSize: 11, fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase", color: c.boss, marginBottom: 12 }}>
          Objetivo
        </div>
        <div style={{ ...serif, fontSize: 22, lineHeight: 1.45, color: c.ink, fontWeight: 400, maxWidth: 620 }}>
          "{brand.goal}"
        </div>
      </div>

      <h2 style={{ ...serif, fontSize: 17, color: c.ink, fontWeight: 500, margin: "0 0 14px" }}>
        Explorar marca
      </h2>
      <div style={{ display: "grid", gridTemplateColumns: "var(--bb-grid-3, repeat(3, 1fr))", gap: 14 }}>
        {MODULES.map((m) => {
          const Icon = m.icon;
          return (
            <button
              key={m.key}
              onClick={() => onOpenSub(m.key)}
              style={{
                textAlign: "left",
                background: "#fff",
                border: `1px solid ${c.line}`,
                borderRadius: 14,
                padding: 20,
                cursor: "pointer",
              }}
            >
              <Icon size={19} color={c.boss} strokeWidth={1.7} />
              <div style={{ ...serif, fontSize: 15.5, color: c.ink, fontWeight: 500, marginTop: 14 }}>
                {m.label}
              </div>
              <div style={{ ...sans, fontSize: 12, color: c.mist, marginTop: 3 }}>{m.sub}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
   CONTEÚDOS — demonstra fluxo de aprovação + nota
--------------------------------------------------------- */
function StatusPill({ status }) {
  const map = {
    approved: { label: "Aprovado", bg: "#E7F5EC", color: c.sage, Icon: CheckCircle2 },
    pending: { label: "Pendente", bg: "#F5EFDF", color: c.amber, Icon: Clock },
    rejected: { label: "Reprovado", bg: "#FBE9EC", color: c.rose, Icon: XCircle },
  };
  const { label, bg, color, Icon } = map[status];
  return (
    <span
      style={{
        ...sans,
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        fontSize: 11.5,
        fontWeight: 600,
        color,
        background: bg,
        borderRadius: 999,
        padding: "4px 10px",
      }}
    >
      <Icon size={12} /> {label}
    </span>
  );
}

const PLATFORM_STYLE = {
  Instagram: { bg: "#FCE8F0", color: "#C23B85" },
  Facebook: { bg: "#E7EEFC", color: "#3B5FC2" },
  TikTok: { bg: "#EDEAF5", color: "#2E2A45" },
};

function MediaPreview({ item, onView }) {
  const label = { video: "Vídeo", image: "Imagem", carousel: "Carrossel" }[item.mediaKind];
  return (
    <div
      style={{
        background: c.paper,
        border: `1px solid ${c.line}`,
        borderRadius: 10,
        padding: "12px 14px",
        display: "flex",
        alignItems: "center",
        gap: 12,
        marginBottom: 14,
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 8,
          background: c.bossSoft,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {item.mediaKind === "video" ? (
          <Video size={17} color={c.boss} strokeWidth={1.8} />
        ) : (
          <FileText size={17} color={c.boss} strokeWidth={1.8} />
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ ...sans, fontSize: 10.5, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: c.mist }}>
          {label} anexado
        </div>
        <div style={{ ...sans, fontSize: 12.5, color: c.ink, marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {item.mediaLabel}
        </div>
      </div>
      <button
        onClick={onView}
        style={{
          ...sans, fontSize: 11.5, fontWeight: 600, color: c.boss, background: "#fff",
          border: `1px solid ${c.line}`, borderRadius: 7, padding: "6px 10px", cursor: "pointer", flexShrink: 0,
        }}
      >
        Ver
      </button>
    </div>
  );
}

function MediaLightbox({ item, onClose }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(23,21,31,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 20, overflowY: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, padding: 24, maxWidth: 420, width: "100%", maxHeight: "85vh", overflowY: "auto", margin: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <span style={{ ...sans, fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: c.boss }}>Pré-visualização</span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: c.mist, padding: 0 }}>
            <XCircle size={18} />
          </button>
        </div>
        <div
          style={{
            height: 260, borderRadius: 12, background: c.paper, display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", gap: 10, border: `1px solid ${c.line}`,
          }}
        >
          {item.mediaKind === "video" ? <Video size={26} color={c.boss} /> : <FileText size={26} color={c.boss} />}
          <span style={{ ...sans, fontSize: 12.5, color: c.mist }}>{item.mediaLabel}</span>
        </div>
        <div style={{ ...sans, fontSize: 11.5, color: c.mistLight, marginTop: 10, textAlign: "center" }}>
          No produto final, aqui aparece o ficheiro real carregado pela equipa.
        </div>
      </div>
    </div>
  );
}

const CAN_MANAGE_ROLES = ["admin_geral", "membro", "agencia_admin", "agencia_membro"];

function NewContentForm({ brandId, session, onDone }) {
  const [type, setType] = useState("Post");
  const [platformKeys, setPlatformKeys] = useState([]);
  const [title, setTitle] = useState("");
  const [scheduledDate, setScheduledDate] = useState("");
  const [copy, setCopy] = useState("");
  const [error, setError] = useState("");
  const addContent = useAddContent(brandId);

  const togglePlatform = (key) => {
    setPlatformKeys((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim()) {
      setError("Dá um título ao conteúdo.");
      return;
    }
    setError("");
    try {
      await addContent.mutateAsync({
        createdBy: session.id,
        typeLabel: type,
        platformKeys,
        title: title.trim(),
        scheduledDate: scheduledDate || null,
        copy,
      });
      onDone();
    } catch (err) {
      setError(err.message || "Não foi possível criar o conteúdo.");
    }
  };

  return (
    <form onSubmit={submit} style={{ background: "#fff", border: `1px solid ${c.line}`, borderRadius: 12, padding: 18, marginBottom: 16, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <select value={type} onChange={(e) => setType(e.target.value)} style={{ ...sans, fontSize: 12.5, border: `1px solid ${c.line}`, borderRadius: 8, padding: "8px 10px" }}>
          {Object.keys(CONTENT_TYPE_KEY_BY_LABEL).map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
        <input type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} style={{ ...sans, fontSize: 12.5, border: `1px solid ${c.line}`, borderRadius: 8, padding: "8px 10px" }} />
      </div>
      <div>
        <div style={{ ...sans, fontSize: 11, color: c.mist, marginBottom: 6 }}>Redes sociais (pode escolher mais do que uma)</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {Object.entries(PLATFORM_LABELS).map(([key, label]) => {
            const active = platformKeys.includes(key);
            return (
              <button
                key={key}
                type="button"
                onClick={() => togglePlatform(key)}
                style={{
                  ...sans, fontSize: 12, fontWeight: 600, borderRadius: 999, padding: "6px 12px", cursor: "pointer",
                  border: `1px solid ${active ? c.boss : c.line}`,
                  color: active ? c.boss : c.mist,
                  background: active ? c.bossSoft : "#fff",
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Título do conteúdo"
        style={{ ...sans, fontSize: 13, border: `1px solid ${c.line}`, borderRadius: 8, padding: "9px 12px" }}
      />
      <textarea
        value={copy}
        onChange={(e) => setCopy(e.target.value)}
        placeholder="Copy / legenda"
        rows={3}
        style={{ ...sans, fontSize: 13, border: `1px solid ${c.line}`, borderRadius: 8, padding: "9px 12px", resize: "vertical" }}
      />
      {error && <div style={{ ...sans, fontSize: 12, color: c.rose }}>{error}</div>}
      <div style={{ display: "flex", gap: 8 }}>
        <button type="submit" disabled={addContent.isPending} style={{ ...sans, fontSize: 12.5, fontWeight: 600, color: "#fff", background: c.boss, border: "none", borderRadius: 8, padding: "8px 16px", cursor: "pointer" }}>
          {addContent.isPending ? "A guardar…" : "Criar"}
        </button>
        <button type="button" onClick={onDone} style={{ ...sans, fontSize: 12.5, color: c.mist, background: "none", border: "none", cursor: "pointer" }}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

function ConteudosView({ brand, onBack, session }) {
  const [openId, setOpenId] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [rejectingId, setRejectingId] = useState(null);
  const [rejectNote, setRejectNote] = useState("");
  const [showForm, setShowForm] = useState(false);

  const contentsQuery = useContents(brand.id, true);
  const approveContent = useApproveContent(brand.id);
  const content = contentsQuery.data || [];
  const canManage = CAN_MANAGE_ROLES.includes(session.role);

  const approve = (id) => approveContent.mutate({ id, status: "approved" });
  const confirmReject = (id) => {
    approveContent.mutate({ id, status: "rejected", note: rejectNote });
    setRejectingId(null);
    setRejectNote("");
  };

  return (
    <div className="bb-page" style={{ padding: "8px 40px 60px", maxWidth: 1040 }}>
      <button
        onClick={onBack}
        style={{
          ...sans,
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 12.5,
          color: c.mist,
          background: "none",
          border: "none",
          cursor: "pointer",
          marginBottom: 20,
        }}
      >
        <ArrowLeft size={14} /> {brand.name}
      </button>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div>
          <Eyebrow>Conteúdos</Eyebrow>
          <h1 style={{ ...serif, fontSize: 27, fontWeight: 500, color: c.ink, margin: "0 0 20px" }}>
            Posts &amp; Reels
          </h1>
        </div>
        {canManage && !showForm && (
          <button
            onClick={() => setShowForm(true)}
            style={{ ...sans, display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, color: "#fff", background: c.boss, border: "none", borderRadius: 8, padding: "9px 14px", cursor: "pointer" }}
          >
            <Plus size={14} /> Novo conteúdo
          </button>
        )}
      </div>

      {showForm && <NewContentForm brandId={brand.id} session={session} onDone={() => setShowForm(false)} />}

      {contentsQuery.isLoading && <div style={{ ...sans, fontSize: 13, color: c.mist }}>A carregar…</div>}
      {contentsQuery.error && <div style={{ ...sans, fontSize: 13, color: c.rose }}>{contentsQuery.error.message}</div>}
      {!contentsQuery.isLoading && content.length === 0 && (
        <div style={{ ...sans, fontSize: 13, color: c.mist }}>Ainda não há conteúdos para esta marca.</div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {content.map((item) => {
          const isOpen = openId === item.id;
          return (
            <div
              key={item.id}
              style={{
                background: "#fff",
                border: `1px solid ${c.line}`,
                borderRadius: 12,
                overflow: "hidden",
              }}
            >
              <button
                onClick={() => setOpenId(isOpen ? null : item.id)}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "16px 18px",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <span
                    style={{
                      ...sans, fontSize: 10.5, fontWeight: 700, letterSpacing: "0.06em",
                      color: c.boss, background: c.bossSoft, borderRadius: 6, padding: "3px 7px",
                    }}
                  >
                    {item.type.toUpperCase()}
                  </span>
                  {item.platforms.map((label) => {
                    const pf = PLATFORM_STYLE[label] || { bg: c.bossSoft, color: c.boss };
                    return (
                      <span
                        key={label}
                        style={{
                          ...sans, fontSize: 10.5, fontWeight: 700, letterSpacing: "0.04em",
                          color: pf.color, background: pf.bg, borderRadius: 6, padding: "3px 7px",
                        }}
                      >
                        {label}
                      </span>
                    );
                  })}
                  <div style={{ ...serif, fontSize: 15, color: c.ink }}>{item.title}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
                  <span style={{ ...sans, fontSize: 12, color: c.mist }}>{item.date}</span>
                  <StatusPill status={item.status} />
                </div>
              </button>

              {isOpen && (
                <div style={{ padding: "0 18px 20px" }}>
                  {item.mediaUrl && <MediaPreview item={item} onView={() => setViewing(item)} />}

                  <div style={{ marginBottom: 14 }}>
                    <div style={{ ...sans, fontSize: 10.5, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: c.mist, marginBottom: 6 }}>
                      Copy
                    </div>
                    <div style={{ ...sans, fontSize: 13, color: c.ink, lineHeight: 1.6, background: c.paper, borderRadius: 10, padding: "12px 14px" }}>
                      {item.copy || "—"}
                    </div>
                  </div>

                  {item.note && (
                    <div style={{ ...sans, fontSize: 12.5, color: c.mist, fontStyle: "italic", marginBottom: 14 }}>
                      Nota do cliente: "{item.note}"
                    </div>
                  )}

                  {item.status === "pending" && rejectingId !== item.id && (
                    <div style={{ display: "flex", gap: 10 }}>
                      <button
                        onClick={() => approve(item.id)}
                        disabled={approveContent.isPending}
                        style={{
                          ...sans, fontSize: 12.5, fontWeight: 600, color: "#fff", background: c.sage,
                          border: "none", borderRadius: 8, padding: "8px 16px", cursor: "pointer",
                          display: "flex", alignItems: "center", gap: 6,
                        }}
                      >
                        <CheckCircle2 size={14} /> Aprovar
                      </button>
                      <button
                        onClick={() => { setRejectingId(item.id); setRejectNote(""); }}
                        style={{
                          ...sans, fontSize: 12.5, fontWeight: 600, color: c.rose, background: "#fff",
                          border: `1px solid ${c.line}`, borderRadius: 8, padding: "8px 16px", cursor: "pointer",
                          display: "flex", alignItems: "center", gap: 6,
                        }}
                      >
                        <XCircle size={14} /> Reprovar
                      </button>
                    </div>
                  )}

                  {rejectingId === item.id && (
                    <div>
                      <textarea
                        value={rejectNote}
                        onChange={(e) => setRejectNote(e.target.value)}
                        placeholder="Explica o que gostarias de mudar (opcional)"
                        rows={2}
                        style={{ ...sans, width: "100%", fontSize: 12.5, border: `1px solid ${c.line}`, borderRadius: 8, padding: "8px 10px", marginBottom: 8, resize: "vertical" }}
                      />
                      <div style={{ display: "flex", gap: 8 }}>
                        <button
                          onClick={() => confirmReject(item.id)}
                          disabled={approveContent.isPending}
                          style={{ ...sans, fontSize: 12.5, fontWeight: 600, color: "#fff", background: c.rose, border: "none", borderRadius: 8, padding: "8px 16px", cursor: "pointer" }}
                        >
                          Confirmar reprovação
                        </button>
                        <button
                          onClick={() => setRejectingId(null)}
                          style={{ ...sans, fontSize: 12.5, color: c.mist, background: "none", border: "none", cursor: "pointer" }}
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {viewing && <MediaLightbox item={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

/* ---------------------------------------------------------
   ROTEIROS — texto simples + aprovar/reprovar com nota
--------------------------------------------------------- */
function NewScriptForm({ brandId, onDone }) {
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const addScript = useAddScript(brandId);

  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim()) {
      setError("Dá um título ao roteiro.");
      return;
    }
    setError("");
    try {
      await addScript.mutateAsync({ title: title.trim(), text });
      onDone();
    } catch (err) {
      setError(err.message || "Não foi possível criar o roteiro.");
    }
  };

  return (
    <form onSubmit={submit} style={{ background: "#fff", border: `1px solid ${c.line}`, borderRadius: 12, padding: 18, marginBottom: 16, display: "flex", flexDirection: "column", gap: 10 }}>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Título do roteiro"
        style={{ ...sans, fontSize: 13, border: `1px solid ${c.line}`, borderRadius: 8, padding: "9px 12px" }}
      />
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Texto do roteiro"
        rows={5}
        style={{ ...sans, fontSize: 13, border: `1px solid ${c.line}`, borderRadius: 8, padding: "9px 12px", resize: "vertical" }}
      />
      {error && <div style={{ ...sans, fontSize: 12, color: c.rose }}>{error}</div>}
      <div style={{ display: "flex", gap: 8 }}>
        <button type="submit" disabled={addScript.isPending} style={{ ...sans, fontSize: 12.5, fontWeight: 600, color: "#fff", background: c.boss, border: "none", borderRadius: 8, padding: "8px 16px", cursor: "pointer" }}>
          {addScript.isPending ? "A guardar…" : "Criar"}
        </button>
        <button type="button" onClick={onDone} style={{ ...sans, fontSize: 12.5, color: c.mist, background: "none", border: "none", cursor: "pointer" }}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

function RoteirosView({ brand, onBack, session }) {
  const [openId, setOpenId] = useState(null);
  const [rejectingId, setRejectingId] = useState(null);
  const [rejectNote, setRejectNote] = useState("");
  const [showForm, setShowForm] = useState(false);

  const scriptsQuery = useScripts(brand.id, true);
  const approveScript = useApproveScript(brand.id);
  const scripts = scriptsQuery.data || [];
  const canManage = CAN_MANAGE_ROLES.includes(session.role);

  const approve = (id) => approveScript.mutate({ id, status: "approved" });
  const confirmReject = (id) => {
    approveScript.mutate({ id, status: "rejected", note: rejectNote });
    setRejectingId(null);
    setRejectNote("");
  };

  return (
    <div className="bb-page" style={{ padding: "8px 40px 60px", maxWidth: 1040 }}>
      <button
        onClick={onBack}
        style={{ ...sans, display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: c.mist, background: "none", border: "none", cursor: "pointer", marginBottom: 20 }}
      >
        <ArrowLeft size={14} /> {brand.name}
      </button>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div>
          <Eyebrow>Roteiros</Eyebrow>
          <h1 style={{ ...serif, fontSize: 27, fontWeight: 500, color: c.ink, margin: "0 0 20px" }}>
            Roteiros de vídeo
          </h1>
        </div>
        {canManage && !showForm && (
          <button
            onClick={() => setShowForm(true)}
            style={{ ...sans, display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, color: "#fff", background: c.boss, border: "none", borderRadius: 8, padding: "9px 14px", cursor: "pointer" }}
          >
            <Plus size={14} /> Novo roteiro
          </button>
        )}
      </div>

      {showForm && <NewScriptForm brandId={brand.id} onDone={() => setShowForm(false)} />}

      {scriptsQuery.isLoading && <div style={{ ...sans, fontSize: 13, color: c.mist }}>A carregar…</div>}
      {scriptsQuery.error && <div style={{ ...sans, fontSize: 13, color: c.rose }}>{scriptsQuery.error.message}</div>}
      {!scriptsQuery.isLoading && scripts.length === 0 && (
        <div style={{ ...sans, fontSize: 13, color: c.mist }}>Ainda não há roteiros para esta marca.</div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {scripts.map((s) => {
          const isOpen = openId === s.id;
          return (
            <div key={s.id} style={{ background: "#fff", border: `1px solid ${c.line}`, borderRadius: 12, overflow: "hidden" }}>
              <button
                onClick={() => setOpenId(isOpen ? null : s.id)}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "16px 18px",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <div style={{ ...serif, fontSize: 15, color: c.ink }}>{s.title}</div>
                <StatusPill status={s.status} />
              </button>
              {isOpen && (
                <div style={{ padding: "0 18px 20px" }}>
                  <div
                    style={{
                      ...sans,
                      fontSize: 13,
                      color: c.ink,
                      lineHeight: 1.7,
                      whiteSpace: "pre-line",
                      background: c.paper,
                      borderRadius: 10,
                      padding: "14px 16px",
                      marginBottom: 14,
                    }}
                  >
                    {s.text}
                  </div>
                  {s.note && (
                    <div style={{ ...sans, fontSize: 12.5, color: c.mist, fontStyle: "italic", marginBottom: 14 }}>
                      Nota do cliente: "{s.note}"
                    </div>
                  )}
                  {s.status === "pending" && rejectingId !== s.id && (
                    <div style={{ display: "flex", gap: 10 }}>
                      <button
                        onClick={() => approve(s.id)}
                        disabled={approveScript.isPending}
                        style={{
                          ...sans, fontSize: 12.5, fontWeight: 600, color: "#fff", background: c.sage,
                          border: "none", borderRadius: 8, padding: "8px 16px", cursor: "pointer",
                          display: "flex", alignItems: "center", gap: 6,
                        }}
                      >
                        <CheckCircle2 size={14} /> Aprovar
                      </button>
                      <button
                        onClick={() => { setRejectingId(s.id); setRejectNote(""); }}
                        style={{
                          ...sans, fontSize: 12.5, fontWeight: 600, color: c.rose, background: "#fff",
                          border: `1px solid ${c.line}`, borderRadius: 8, padding: "8px 16px", cursor: "pointer",
                          display: "flex", alignItems: "center", gap: 6,
                        }}
                      >
                        <XCircle size={14} /> Reprovar
                      </button>
                    </div>
                  )}

                  {rejectingId === s.id && (
                    <div>
                      <textarea
                        value={rejectNote}
                        onChange={(e) => setRejectNote(e.target.value)}
                        placeholder="Explica o que gostarias de mudar (opcional)"
                        rows={2}
                        style={{ ...sans, width: "100%", fontSize: 12.5, border: `1px solid ${c.line}`, borderRadius: 8, padding: "8px 10px", marginBottom: 8, resize: "vertical" }}
                      />
                      <div style={{ display: "flex", gap: 8 }}>
                        <button
                          onClick={() => confirmReject(s.id)}
                          disabled={approveScript.isPending}
                          style={{ ...sans, fontSize: 12.5, fontWeight: 600, color: "#fff", background: c.rose, border: "none", borderRadius: 8, padding: "8px 16px", cursor: "pointer" }}
                        >
                          Confirmar reprovação
                        </button>
                        <button
                          onClick={() => setRejectingId(null)}
                          style={{ ...sans, fontSize: 12.5, color: c.mist, background: "none", border: "none", cursor: "pointer" }}
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
   PLANO ESTRATÉGICO — fases → metas → geram tarefas
--------------------------------------------------------- */
function NewPhaseForm({ brandId, onDone }) {
  const [title, setTitle] = useState("");
  const [reviewFrequency, setReviewFrequency] = useState("weekly");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const addPlan = useAddActionPlan(brandId);

  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim()) {
      setError("Dá um título à fase.");
      return;
    }
    setError("");
    try {
      await addPlan.mutateAsync({ title: title.trim(), reviewFrequency, description });
      onDone();
    } catch (err) {
      setError(err.message || "Não foi possível criar a fase.");
    }
  };

  return (
    <form onSubmit={submit} style={{ background: "#fff", border: `1px solid ${c.line}`, borderRadius: 12, padding: 18, marginBottom: 16, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Título da fase (ex: Fase 1 — Fundação Digital)"
          style={{ ...sans, flex: 1, minWidth: 220, fontSize: 13, border: `1px solid ${c.line}`, borderRadius: 8, padding: "9px 12px" }}
        />
        <select value={reviewFrequency} onChange={(e) => setReviewFrequency(e.target.value)} style={{ ...sans, fontSize: 12.5, border: `1px solid ${c.line}`, borderRadius: 8, padding: "8px 10px" }}>
          {Object.entries(REVIEW_FREQ_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </div>
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Descrição (opcional)"
        rows={2}
        style={{ ...sans, fontSize: 13, border: `1px solid ${c.line}`, borderRadius: 8, padding: "9px 12px", resize: "vertical" }}
      />
      {error && <div style={{ ...sans, fontSize: 12, color: c.rose }}>{error}</div>}
      <div style={{ display: "flex", gap: 8 }}>
        <button type="submit" disabled={addPlan.isPending} style={{ ...sans, fontSize: 12.5, fontWeight: 600, color: "#fff", background: c.boss, border: "none", borderRadius: 8, padding: "8px 16px", cursor: "pointer" }}>
          {addPlan.isPending ? "A guardar…" : "Criar fase"}
        </button>
        <button type="button" onClick={onDone} style={{ ...sans, fontSize: 12.5, color: c.mist, background: "none", border: "none", cursor: "pointer" }}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

function PhaseCard({ phase, canManage, saveGoals }) {
  const [newGoal, setNewGoal] = useState("");

  const toggleGoal = (i) => {
    const goals = phase.goals.map((g, idx) => (idx === i ? { ...g, done: !g.done } : g));
    saveGoals.mutate({ id: phase.id, goals });
  };
  const addGoal = () => {
    if (!newGoal.trim()) return;
    saveGoals.mutate({ id: phase.id, goals: [...phase.goals, { text: newGoal.trim(), done: false }] });
    setNewGoal("");
  };

  const pct = phase.total ? Math.round((phase.done / phase.total) * 100) : 0;
  return (
    <div style={{ background: "#fff", border: `1px solid ${c.line}`, borderRadius: 14, padding: "20px 22px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <div style={{ ...serif, fontSize: 16.5, color: c.ink, fontWeight: 500 }}>{phase.title}</div>
        <span style={{ ...sans, fontSize: 11, color: c.mist }}>{phase.freq}</span>
      </div>
      <div style={{ ...sans, fontSize: 12, color: c.mist, marginBottom: 10 }}>
        Metas: {phase.done}/{phase.total}
      </div>
      <div style={{ height: 6, background: c.paper, borderRadius: 999, marginBottom: 16, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: `linear-gradient(90deg, ${c.boss}, ${c.bossDeep})`, borderRadius: 999, transition: "width 0.25s ease" }} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 2, marginBottom: canManage ? 12 : 0 }}>
        {phase.goals.map((g, i) => (
          <button
            key={i}
            onClick={() => toggleGoal(i)}
            style={{
              display: "flex", alignItems: "center", gap: 10, background: "none", border: "none",
              cursor: "pointer", padding: "5px 4px", borderRadius: 6, textAlign: "left", width: "100%",
            }}
          >
            {g.done ? (
              <CheckCircle2 size={16} color={c.sage} strokeWidth={2} style={{ flexShrink: 0 }} />
            ) : (
              <span style={{ width: 16, height: 16, borderRadius: 999, border: `1.5px solid ${c.line}`, flexShrink: 0 }} />
            )}
            <span
              style={{
                ...sans, fontSize: 13, color: g.done ? c.mist : c.ink,
                textDecoration: g.done ? "line-through" : "none",
              }}
            >
              {g.text}
            </span>
          </button>
        ))}
        {phase.goals.length === 0 && <div style={{ ...sans, fontSize: 12.5, color: c.mist }}>Ainda sem metas.</div>}
      </div>
      {canManage && (
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={newGoal}
            onChange={(e) => setNewGoal(e.target.value)}
            placeholder="Nova meta"
            style={{ ...sans, flex: 1, fontSize: 12.5, border: `1px solid ${c.line}`, borderRadius: 8, padding: "7px 10px" }}
          />
          <button onClick={addGoal} type="button" style={{ ...sans, fontSize: 12, fontWeight: 600, color: c.boss, background: c.bossSoft, border: "none", borderRadius: 7, padding: "6px 12px", cursor: "pointer" }}>
            Adicionar
          </button>
        </div>
      )}
    </div>
  );
}

function PlanoEstrategicoView({ brand, onBack, session }) {
  const [showForm, setShowForm] = useState(false);
  const plansQuery = useActionPlans(brand.id, true);
  const saveGoals = useSaveGoals(brand.id);
  const phases = plansQuery.data || [];
  const canManage = CAN_MANAGE_ROLES.includes(session.role);

  return (
    <div className="bb-page" style={{ padding: "8px 40px 60px", maxWidth: 1040 }}>
      <button
        onClick={onBack}
        style={{ ...sans, display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: c.mist, background: "none", border: "none", cursor: "pointer", marginBottom: 20 }}
      >
        <ArrowLeft size={14} /> {brand.name}
      </button>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div>
          <Eyebrow>Plano Estratégico</Eyebrow>
          <h1 style={{ ...serif, fontSize: 27, fontWeight: 500, color: c.ink, margin: "0 0 20px" }}>
            Fases e tarefas
          </h1>
        </div>
        {canManage && !showForm && (
          <button
            onClick={() => setShowForm(true)}
            style={{ ...sans, display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, color: "#fff", background: c.boss, border: "none", borderRadius: 8, padding: "9px 14px", cursor: "pointer" }}
          >
            <Plus size={14} /> Nova fase
          </button>
        )}
      </div>

      {showForm && <NewPhaseForm brandId={brand.id} onDone={() => setShowForm(false)} />}

      {plansQuery.isLoading && <div style={{ ...sans, fontSize: 13, color: c.mist }}>A carregar…</div>}
      {!plansQuery.isLoading && phases.length === 0 && (
        <div style={{ ...sans, fontSize: 13, color: c.mist }}>Ainda não há fases definidas para esta marca.</div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {phases.map((phase) => (
          <PhaseCard key={phase.id} phase={phase} canManage={canManage} saveGoals={saveGoals} />
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
   DASHBOARDS — lista de relatórios da marca
--------------------------------------------------------- */
function DashboardsView({ brand, onBack, session }) {
  const [openReportId, setOpenReportId] = useState(null);
  const reportsQuery = useReports(brand.id, true);
  const addReport = useAddReport(brand.id);
  const reports = reportsQuery.data || [];
  const canManage = CAN_MANAGE_ROLES.includes(session.role);

  const createReport = async () => {
    const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
    const now = new Date();
    const title = `${monthNames[now.getMonth()]} ${now.getFullYear()}`;
    const newReport = await addReport.mutateAsync({ title });
    setOpenReportId(newReport.id);
  };

  const openReport = reports.find((r) => r.id === openReportId);
  if (openReport) {
    return <ReportDetail report={openReport} brand={brand} onBack={() => setOpenReportId(null)} session={session} />;
  }

  return (
    <div className="bb-page" style={{ padding: "8px 40px 60px", maxWidth: 1040 }}>
      <button
        onClick={onBack}
        style={{ ...sans, display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: c.mist, background: "none", border: "none", cursor: "pointer", marginBottom: 20 }}
      >
        <ArrowLeft size={14} /> {brand.name}
      </button>
      <Eyebrow>Dashboards</Eyebrow>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
        <h1 style={{ ...serif, fontSize: 27, fontWeight: 500, color: c.ink, margin: 0 }}>
          Performance da marca
        </h1>
        {canManage && (
          <button
            onClick={createReport}
            disabled={addReport.isPending}
            style={{
              ...sans, display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600,
              color: "#fff", background: c.boss, border: "none", borderRadius: 8, padding: "9px 16px", cursor: "pointer",
            }}
          >
            <Plus size={14} /> {addReport.isPending ? "A criar…" : "Criar novo"}
          </button>
        )}
      </div>

      {reportsQuery.isLoading && <div style={{ ...sans, fontSize: 13, color: c.mist }}>A carregar…</div>}
      {!reportsQuery.isLoading && reports.length === 0 && (
        <div style={{ ...sans, fontSize: 13, color: c.mist }}>Ainda não há relatórios para esta marca.</div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "var(--bb-grid-2, repeat(2, 1fr))", gap: 14 }}>
        {reports.map((r) => (
          <button
            key={r.id}
            onClick={() => setOpenReportId(r.id)}
            style={{ textAlign: "left", background: "#fff", border: `1px solid ${c.line}`, borderRadius: 14, padding: 22, cursor: "pointer" }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <BarChart3 size={16} color={c.boss} strokeWidth={1.8} />
                <div style={{ ...serif, fontSize: 16, color: c.ink, fontWeight: 500 }}>{r.title}</div>
              </div>
              <ChevronRight size={16} color={c.mist} />
            </div>
            <div style={{ display: "flex", gap: 22 }}>
              <div>
                <div style={{ ...serif, fontSize: 19, color: c.ink }}>{r.reach}</div>
                <div style={{ ...sans, fontSize: 11, color: c.mist, marginTop: 2 }}>Alcance</div>
              </div>
              <div>
                <div style={{ ...serif, fontSize: 19, color: c.ink }}>{r.engagement}</div>
                <div style={{ ...sans, fontSize: 11, color: c.mist, marginTop: 2 }}>Engajamento</div>
              </div>
              <div>
                <div style={{ ...serif, fontSize: 19, color: c.sage }}>{r.roi}</div>
                <div style={{ ...sans, fontSize: 11, color: c.mist, marginTop: 2 }}>ROI</div>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
   DETALHE DO RELATÓRIO
--------------------------------------------------------- */
const PIE_COLORS = ["#4C2889", "#7C4DE0", "#9B72E8", "#B794F0", "#DCCBFA"];
const METRIC_ICONS = { reach: Eye, engagement: Zap, conversions: Target, roi: TrendingUp };

function MetricCard({ metricKey, label, value, trend }) {
  const Icon = METRIC_ICONS[metricKey];
  return (
    <div style={{ background: "#fff", border: `1px solid ${c.line}`, borderRadius: 14, padding: "18px 20px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ width: 32, height: 32, borderRadius: 10, background: c.bossSoft, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon size={15} color={c.boss} strokeWidth={2} />
        </div>
        {trend && (
          <span style={{ ...sans, fontSize: 10.5, fontWeight: 600, color: c.sage, background: "#E7F5EC", borderRadius: 999, padding: "2px 7px" }}>
            {trend}
          </span>
        )}
      </div>
      <div style={{ ...sans, fontSize: 10.5, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: c.mist, marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ ...serif, fontSize: 24, color: c.ink }}>{value}</div>
    </div>
  );
}

function ChartCard({ title, sub, right, children }) {
  return (
    <div style={{ background: "#fff", border: `1px solid ${c.line}`, borderRadius: 14, padding: 22 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 18 }}>
        <div>
          <div style={{ ...serif, fontSize: 15.5, color: c.ink, marginBottom: 4 }}>{title}</div>
          <div style={{ ...sans, fontSize: 11.5, color: c.mist }}>{sub}</div>
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

function ReportDetail({ report, brand, onBack, session }) {
  const [demoTab, setDemoTab] = useState("idade");
  const [newStep, setNewStep] = useState("");
  const canManage = CAN_MANAGE_ROLES.includes(session.role);
  const saveNextSteps = useSaveNextSteps(brand.id);
  const steps = report.nextSteps;

  const toggleStep = (i) => {
    const nextSteps = steps.map((s, idx) => (idx === i ? { ...s, done: !s.done } : s));
    saveNextSteps.mutate({ id: report.id, nextSteps });
  };
  const addStep = () => {
    if (!newStep.trim()) return;
    saveNextSteps.mutate({ id: report.id, nextSteps: [...steps, { text: newStep.trim(), done: false }] });
    setNewStep("");
  };
  const doneCount = steps.filter((s) => s.done).length;
  const demoData = report.demographics[demoTab];

  return (
    <div className="bb-page" style={{ padding: "8px 40px 60px", maxWidth: 1080 }}>
      <button
        onClick={onBack}
        style={{ ...sans, display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: c.mist, background: "none", border: "none", cursor: "pointer", marginBottom: 20 }}
      >
        <ArrowLeft size={14} /> Dashboards
      </button>
      <Eyebrow>Relatório · {brand.name}</Eyebrow>
      <h1 style={{ ...serif, fontSize: 27, fontWeight: 500, color: c.ink, margin: "0 0 24px" }}>
        {report.title}
      </h1>

      <div style={{ display: "grid", gridTemplateColumns: "var(--bb-grid-4, repeat(4, 1fr))", gap: 12, marginBottom: 14 }}>
        <MetricCard metricKey="reach" label="Alcance" value={report.reach} trend={report.reachTrend} />
        <MetricCard metricKey="engagement" label="Engajamento" value={report.engagement} trend={report.engagementTrend} />
        <MetricCard metricKey="conversions" label="Conversões" value={report.conversions} trend={report.conversionsTrend} />
        <MetricCard metricKey="roi" label="ROI" value={report.roi} trend={report.roiTrend} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "var(--bb-grid-2, 0.85fr 1.15fr)", gap: 14, marginBottom: 14 }}>
        {/* Demografia — donut com abas */}
        <ChartCard
          title="Demografia"
          sub="Distribuição do público"
          right={
            <div style={{ display: "flex", gap: 2, background: c.paper, borderRadius: 8, padding: 3 }}>
              {["idade", "genero", "local"].map((t) => (
                <button
                  key={t}
                  onClick={() => setDemoTab(t)}
                  style={{
                    ...sans, fontSize: 11, fontWeight: 600, padding: "5px 10px", borderRadius: 6, border: "none", cursor: "pointer",
                    color: demoTab === t ? "#fff" : c.mist,
                    background: demoTab === t ? c.boss : "transparent",
                    textTransform: "capitalize",
                  }}
                >
                  {t === "genero" ? "Género" : t}
                </button>
              ))}
            </div>
          }
        >
          <div style={{ height: 190 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={demoData} dataKey="pct" nameKey="label" innerRadius={55} outerRadius={80} paddingAngle={2}>
                  {demoData.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} stroke="none" />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => `${v}%`} contentStyle={{ ...sans, fontSize: 12, borderRadius: 8, border: `1px solid ${c.line}` }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 7, marginTop: 10 }}>
            {demoData.map((d, i) => (
              <div key={d.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", ...sans, fontSize: 12 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 8, color: c.ink }}>
                  <span style={{ width: 8, height: 8, borderRadius: 3, background: PIE_COLORS[i % PIE_COLORS.length] }} />
                  {d.label}
                </span>
                <span style={{ color: c.mist }}>{d.pct}%</span>
              </div>
            ))}
          </div>
        </ChartCard>

        {/* ROI por Campanha */}
        <ChartCard title="ROI por Campanha" sub="Investimento vs. Receita">
          <div style={{ height: 190, marginBottom: 14 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={report.campaigns} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke={c.line} vertical={false} />
                <XAxis dataKey="name" tick={{ ...sans, fontSize: 10.5, fill: c.mist }} axisLine={{ stroke: c.line }} tickLine={false} />
                <YAxis tick={{ ...sans, fontSize: 10.5, fill: c.mist }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ ...sans, fontSize: 12, borderRadius: 8, border: `1px solid ${c.line}` }} />
                <Bar dataKey="invest" name="Invest." fill="#D6C7F5" radius={[4, 4, 0, 0]} />
                <Bar dataKey="revenue" name="Receita" fill={c.boss} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: `var(--bb-grid-2, repeat(${Math.min(report.campaigns.length, 4)}, 1fr))`, gap: 8 }}>
            {report.campaigns.map((cp) => (
              <div key={cp.name} style={{ background: c.paper, borderRadius: 10, padding: "8px 10px" }}>
                <div style={{ ...sans, fontSize: 9.5, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: c.mist }}>ROI</div>
                <div style={{ ...serif, fontSize: 16, color: c.sage }}>{cp.roi}</div>
                <div style={{ ...sans, fontSize: 10, color: c.mist, marginTop: 1 }}>{cp.name}</div>
              </div>
            ))}
          </div>
        </ChartCard>
      </div>

      {/* Histórico vs Projeção */}
      <ChartCard title="Histórico vs Projeção" sub="Alcance mensal · dados reais e previsão">
        <div style={{ height: 200 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={report.history}>
              <defs>
                <linearGradient id="realFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={c.boss} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={c.boss} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={c.line} vertical={false} />
              <XAxis dataKey="month" tick={{ ...sans, fontSize: 10.5, fill: c.mist }} axisLine={{ stroke: c.line }} tickLine={false} />
              <YAxis tick={{ ...sans, fontSize: 10.5, fill: c.mist }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ ...sans, fontSize: 12, borderRadius: 8, border: `1px solid ${c.line}` }} />
              <Area type="monotone" dataKey="real" name="Real" stroke={c.boss} strokeWidth={2} fill="url(#realFill)" connectNulls={false} />
              <Line type="monotone" dataKey="proj" name="Projeção" stroke={c.boss} strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      <div style={{ display: "grid", gridTemplateColumns: "var(--bb-grid-2, 1fr 1fr)", gap: 14, marginTop: 14 }}>
        <ChartCard title="Melhor Hora para Postar" sub="Baseado em engajamento médio">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {report.bestTimes.map((t, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: c.paper, borderRadius: 10, padding: "10px 12px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ ...sans, fontSize: 11, fontWeight: 700, color: c.boss, background: c.bossSoft, borderRadius: 6, padding: "2px 7px" }}>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <div style={{ ...sans, fontSize: 12.5, color: c.ink, fontWeight: 500 }}>{t.day}</div>
                    <div style={{ ...sans, fontSize: 11, color: c.mist }}>{t.hour}</div>
                  </div>
                </div>
                <span style={{ ...serif, fontSize: 14, color: c.sage }}>{t.eng}</span>
              </div>
            ))}
          </div>
        </ChartCard>

        <ChartCard
          title="Próximos Passos"
          sub="Ações estratégicas recomendadas"
          right={
            <span style={{ ...sans, fontSize: 11, fontWeight: 600, color: c.mist, background: c.paper, borderRadius: 999, padding: "3px 9px" }}>
              {doneCount}/{steps.length}
            </span>
          }
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 2, marginBottom: 12 }}>
            {steps.map((s, i) => (
              <button
                key={i}
                onClick={() => canManage && toggleStep(i)}
                disabled={!canManage}
                style={{ display: "flex", alignItems: "center", gap: 10, background: "none", border: "none", cursor: canManage ? "pointer" : "default", padding: "6px 4px", textAlign: "left", width: "100%" }}
              >
                {s.done ? (
                  <CheckCircle2 size={16} color={c.sage} strokeWidth={2} style={{ flexShrink: 0 }} />
                ) : (
                  <span style={{ width: 16, height: 16, borderRadius: 999, border: `1.5px solid ${c.line}`, flexShrink: 0 }} />
                )}
                <span style={{ ...sans, fontSize: 13, color: s.done ? c.mist : c.ink, textDecoration: s.done ? "line-through" : "none" }}>
                  {s.text}
                </span>
              </button>
            ))}
          </div>
          {canManage && (
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={newStep}
                onChange={(e) => setNewStep(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addStep()}
                placeholder="Adicionar próximo passo..."
                style={{ ...sans, flex: 1, fontSize: 12.5, border: `1px solid ${c.line}`, borderRadius: 8, padding: "8px 12px", outline: "none", color: c.ink }}
              />
              <button
                onClick={addStep}
                style={{ width: 34, height: 34, borderRadius: 8, background: c.boss, border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}
              >
                <Plus size={15} color="#fff" />
              </button>
            </div>
          )}
        </ChartCard>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
   BRAND BOOK — resultado tratado do wizard (não o processo em bruto)
--------------------------------------------------------- */
function BrandBookView({ brand, onBack, session }) {
  const canManage = CAN_MANAGE_ROLES.includes(session.role);
  const [logoUrl, setLogoUrl] = useState(brand.logoUrl);
  const [colors, setColors] = useState(brand.brandBook.colors);
  const [newColor, setNewColor] = useState("#7C4DE0");
  const [heading, setHeading] = useState(brand.brandBook.typography.heading);
  const [body, setBody] = useState(brand.brandBook.typography.body);
  const [textures, setTextures] = useState(brand.brandBook.textures);
  const [newTexture, setNewTexture] = useState("");
  const [guidelines, setGuidelines] = useState(brand.brandBook.guidelines);
  const [contractScope, setContractScope] = useState(brand.contractScope);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const updateBrandBook = useUpdateBrandBook(brand.id);

  const onLogoSelected = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const url = await uploadBrandLogo(brand.id, file);
      setLogoUrl(url);
    } catch (err) {
      setError(err.message || "Não foi possível carregar o logótipo.");
    } finally {
      setUploading(false);
    }
  };

  const addColor = () => {
    if (!colors.includes(newColor)) setColors((prev) => [...prev, newColor]);
  };
  const removeColor = (hex) => setColors((prev) => prev.filter((h) => h !== hex));

  const addTexture = () => {
    if (newTexture.trim()) {
      setTextures((prev) => [...prev, newTexture.trim()]);
      setNewTexture("");
    }
  };
  const removeTexture = (t) => setTextures((prev) => prev.filter((x) => x !== t));

  const save = async () => {
    setError("");
    setSaved(false);
    try {
      await updateBrandBook.mutateAsync({
        logoUrl,
        contractScope,
        brandBook: { colors, typography: { heading, body }, textures, guidelines },
      });
      setSaved(true);
    } catch (err) {
      setError(err.message || "Não foi possível guardar as alterações.");
    }
  };

  return (
    <div className="bb-page" style={{ padding: "8px 40px 60px", maxWidth: 1040 }}>
      <button
        onClick={onBack}
        style={{ ...sans, display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: c.mist, background: "none", border: "none", cursor: "pointer", marginBottom: 20 }}
      >
        <ArrowLeft size={14} /> {brand.name}
      </button>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div>
          <Eyebrow>Brand Book</Eyebrow>
          <h1 style={{ ...serif, fontSize: 27, fontWeight: 500, color: c.ink, margin: "0 0 20px" }}>
            Identidade visual e diretrizes
          </h1>
        </div>
        {canManage && (
          <button
            onClick={save}
            disabled={updateBrandBook.isPending}
            style={{ ...sans, fontSize: 12.5, fontWeight: 600, color: "#fff", background: c.boss, border: "none", borderRadius: 8, padding: "9px 16px", cursor: "pointer" }}
          >
            {updateBrandBook.isPending ? "A guardar…" : "Guardar alterações"}
          </button>
        )}
      </div>
      {error && <div style={{ ...sans, fontSize: 12.5, color: c.rose, marginBottom: 14 }}>{error}</div>}
      {saved && <div style={{ ...sans, fontSize: 12.5, color: c.sage, marginBottom: 14 }}>Alterações guardadas.</div>}

      <div style={{ display: "grid", gridTemplateColumns: "var(--bb-grid-2, 1fr 1fr)", gap: 14, marginBottom: 14 }}>
        <ChartCard title="Logótipo" sub="Ficheiro oficial da marca">
          <label
            style={{
              height: 90, borderRadius: 12, cursor: canManage ? "pointer" : "default",
              border: logoUrl ? "none" : `1.5px dashed ${c.line}`,
              background: logoUrl ? `url(${logoUrl}) center/contain no-repeat ${c.paper}` : c.paper,
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6,
            }}
          >
            {canManage && <input type="file" accept="image/*" onChange={onLogoSelected} style={{ display: "none" }} />}
            {!logoUrl && (
              <>
                <Plus size={16} color={c.mist} />
                <span style={{ ...sans, fontSize: 11.5, color: c.mist }}>{uploading ? "A carregar…" : canManage ? "Carregar logótipo" : "Sem logótipo"}</span>
              </>
            )}
          </label>
        </ChartCard>

        <ChartCard title="Paleta de cores" sub="Cores oficiais da marca">
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: canManage ? 14 : 0 }}>
            {colors.map((hex) => (
              <div key={hex} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, position: "relative" }}>
                <div style={{ width: 44, height: 44, borderRadius: 999, background: hex, border: `1px solid ${c.line}` }} />
                <div style={{ ...sans, fontSize: 10, color: c.mist }}>{hex}</div>
                {canManage && (
                  <button
                    onClick={() => removeColor(hex)}
                    title="Remover"
                    style={{ position: "absolute", top: -4, right: -4, background: "#fff", border: `1px solid ${c.line}`, borderRadius: 999, width: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}
                  >
                    <XCircle size={11} color={c.rose} />
                  </button>
                )}
              </div>
            ))}
            {colors.length === 0 && <div style={{ ...sans, fontSize: 12.5, color: c.mist }}>Sem cores definidas.</div>}
          </div>
          {canManage && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="color" value={newColor} onChange={(e) => setNewColor(e.target.value)} style={{ width: 34, height: 30, border: `1px solid ${c.line}`, borderRadius: 6, padding: 2, cursor: "pointer" }} />
              <button onClick={addColor} type="button" style={{ ...sans, fontSize: 12, fontWeight: 600, color: c.boss, background: c.bossSoft, border: "none", borderRadius: 7, padding: "6px 12px", cursor: "pointer" }}>
                Adicionar cor
              </button>
            </div>
          )}
        </ChartCard>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "var(--bb-grid-2, 1fr 1fr)", gap: 14, marginBottom: 14 }}>
        <ChartCard title="Tipografia" sub="Fontes de referência">
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <div style={{ ...sans, fontSize: 11, color: c.mist, marginBottom: 4 }}>Títulos</div>
              {canManage ? (
                <input value={heading} onChange={(e) => setHeading(e.target.value)} style={{ ...serif, fontSize: 16, color: c.ink, border: `1px solid ${c.line}`, borderRadius: 8, padding: "8px 10px", width: "100%" }} />
              ) : (
                <div style={{ ...serif, fontSize: 20, color: c.ink }}>{heading || "—"}</div>
              )}
            </div>
            <div>
              <div style={{ ...sans, fontSize: 11, color: c.mist, marginBottom: 4 }}>Texto corrido</div>
              {canManage ? (
                <input value={body} onChange={(e) => setBody(e.target.value)} style={{ ...sans, fontSize: 13, color: c.ink, border: `1px solid ${c.line}`, borderRadius: 8, padding: "8px 10px", width: "100%" }} />
              ) : (
                <div style={{ ...sans, fontSize: 16, color: c.ink }}>{body || "—"}</div>
              )}
            </div>
          </div>
        </ChartCard>

        <ChartCard title="Texturas" sub="Elementos visuais de apoio">
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: canManage ? 12 : 0 }}>
            {textures.map((t) => (
              <div key={t} style={{ display: "flex", alignItems: "center", gap: 10, background: c.paper, borderRadius: 8, padding: "8px 10px" }}>
                <div style={{ width: 26, height: 26, borderRadius: 7, background: `linear-gradient(135deg, ${c.boss}, ${c.bossDeep})`, opacity: 0.35, flexShrink: 0 }} />
                <span style={{ ...sans, fontSize: 12.5, color: c.ink, flex: 1 }}>{t}</span>
                {canManage && (
                  <button onClick={() => removeTexture(t)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                    <Trash2 size={13} color={c.mist} />
                  </button>
                )}
              </div>
            ))}
            {textures.length === 0 && <div style={{ ...sans, fontSize: 12.5, color: c.mist }}>Sem texturas definidas.</div>}
          </div>
          {canManage && (
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={newTexture}
                onChange={(e) => setNewTexture(e.target.value)}
                placeholder="Nova textura ou elemento visual"
                style={{ ...sans, flex: 1, fontSize: 12.5, border: `1px solid ${c.line}`, borderRadius: 8, padding: "7px 10px" }}
              />
              <button onClick={addTexture} type="button" style={{ ...sans, fontSize: 12, fontWeight: 600, color: c.boss, background: c.bossSoft, border: "none", borderRadius: 7, padding: "6px 12px", cursor: "pointer" }}>
                Adicionar
              </button>
            </div>
          )}
        </ChartCard>
      </div>

      <div style={{ marginBottom: 14 }}>
        <ChartCard title="Diretrizes estratégicas" sub="Como a marca deve comunicar">
          {canManage ? (
            <textarea
              value={guidelines}
              onChange={(e) => setGuidelines(e.target.value)}
              rows={4}
              style={{ ...sans, width: "100%", fontSize: 13, color: c.ink, lineHeight: 1.7, border: `1px solid ${c.line}`, borderRadius: 8, padding: "10px 12px", resize: "vertical" }}
            />
          ) : (
            <div style={{ ...sans, fontSize: 13, color: c.ink, lineHeight: 1.7 }}>{guidelines || "—"}</div>
          )}
        </ChartCard>
      </div>

      <ChartCard title="O que foi acordado" sub="Escopo contratual — informação de apoio">
        {canManage ? (
          <textarea
            value={contractScope}
            onChange={(e) => setContractScope(e.target.value)}
            rows={3}
            style={{ ...sans, width: "100%", fontSize: 13, color: c.mist, lineHeight: 1.7, border: `1px solid ${c.line}`, borderRadius: 8, padding: "10px 12px", resize: "vertical" }}
          />
        ) : (
          <div style={{ ...sans, fontSize: 13, color: c.mist, lineHeight: 1.7 }}>{contractScope || "—"}</div>
        )}
      </ChartCard>
    </div>
  );
}

/* ---------------------------------------------------------
   CRONOGRAMA DE STORIES
--------------------------------------------------------- */
function StoryDetailModal({ story, onClose }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(23,21,31,0.45)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: "#fff", borderRadius: 16, padding: 26, maxWidth: 440, width: "100%", maxHeight: "80vh", overflowY: "auto" }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 4 }}>
          <div style={{ ...sans, fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: c.boss }}>
            Como criar
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: c.mist, padding: 0 }}>
            <XCircle size={18} />
          </button>
        </div>
        <div style={{ ...serif, fontSize: 19, color: c.ink, marginBottom: 18 }}>{story.title}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {story.steps.map((s, i) => (
            <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              <span
                style={{
                  ...sans, fontSize: 11, fontWeight: 700, color: c.boss, background: c.bossSoft,
                  borderRadius: 999, width: 20, height: 20, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                {i + 1}
              </span>
              <span style={{ ...sans, fontSize: 13, color: c.ink, lineHeight: 1.55, paddingTop: 1 }}>{s}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const STORY_DAYS = [
  { key: "segunda", label: "Segunda-feira" },
  { key: "terca", label: "Terça-feira" },
  { key: "quarta", label: "Quarta-feira" },
  { key: "quinta", label: "Quinta-feira" },
  { key: "sexta", label: "Sexta-feira" },
];

function StoryDayColumn({ label, ideas, canManage, onSelect, onAdd }) {
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [steps, setSteps] = useState("");

  const submit = () => {
    if (!title.trim()) return;
    onAdd({ title: title.trim(), steps: steps.split("\n").map((s) => s.trim()).filter(Boolean) });
    setTitle("");
    setSteps("");
    setAdding(false);
  };

  return (
    <div style={{ background: "#fff", border: `1px solid ${c.line}`, borderRadius: 12, padding: 14 }}>
      <div style={{ ...sans, fontSize: 11, fontWeight: 600, color: c.boss, marginBottom: 10 }}>{label}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: canManage ? 8 : 0 }}>
        {ideas.map((s, i) => (
          <button
            key={i}
            onClick={() => onSelect(s)}
            style={{
              ...sans, fontSize: 11.5, color: c.ink, background: c.paper, borderRadius: 6, padding: "6px 8px",
              border: "none", cursor: "pointer", textAlign: "left", width: "100%",
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4,
            }}
          >
            {s.title}
            <ChevronRight size={12} color={c.mistLight} style={{ flexShrink: 0 }} />
          </button>
        ))}
      </div>
      {canManage && (adding ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Título"
            style={{ ...sans, fontSize: 11.5, border: `1px solid ${c.line}`, borderRadius: 6, padding: "6px 8px" }}
          />
          <textarea
            value={steps}
            onChange={(e) => setSteps(e.target.value)}
            placeholder="Passos (um por linha)"
            rows={2}
            style={{ ...sans, fontSize: 11.5, border: `1px solid ${c.line}`, borderRadius: 6, padding: "6px 8px", resize: "vertical" }}
          />
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={submit} type="button" style={{ ...sans, fontSize: 11, fontWeight: 600, color: "#fff", background: c.boss, border: "none", borderRadius: 6, padding: "5px 9px", cursor: "pointer" }}>Guardar</button>
            <button onClick={() => setAdding(false)} type="button" style={{ ...sans, fontSize: 11, color: c.mist, background: "none", border: "none", cursor: "pointer" }}>Cancelar</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} type="button" style={{ ...sans, fontSize: 11, color: c.boss, background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", gap: 4 }}>
          <Plus size={12} /> Adicionar
        </button>
      ))}
    </div>
  );
}

function StoriesView({ brand, onBack, session }) {
  const [selected, setSelected] = useState(null);
  const [objective, setObjective] = useState(null);
  const canManage = CAN_MANAGE_ROLES.includes(session.role);

  const planQuery = useStoryWeekPlan(brand.id, true);
  const savePlan = useSaveStoryWeekPlan(brand.id);
  const plan = planQuery.data;
  const objectiveValue = objective !== null ? objective : (plan?.objective || "");

  const addIdea = (dayKey, idea) => {
    const days = { ...(plan?.days || {}) };
    days[dayKey] = [...(days[dayKey] || []), idea];
    savePlan.mutate({ id: plan?.id, objective: objectiveValue, days });
  };
  const saveObjective = () => {
    savePlan.mutate({ id: plan?.id, objective: objectiveValue, days: plan?.days || {} });
  };

  return (
    <div className="bb-page" style={{ padding: "8px 40px 60px", maxWidth: 1040 }}>
      <button
        onClick={onBack}
        style={{ ...sans, display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: c.mist, background: "none", border: "none", cursor: "pointer", marginBottom: 20 }}
      >
        <ArrowLeft size={14} /> {brand.name}
      </button>
      <Eyebrow>Cronograma de Stories</Eyebrow>
      <h1 style={{ ...serif, fontSize: 27, fontWeight: 500, color: c.ink, margin: "0 0 8px" }}>
        Planeamento semanal
      </h1>
      <div style={{ ...sans, fontSize: 13, color: c.mist, marginBottom: 20, maxWidth: 560, lineHeight: 1.6 }}>
        O caminho para se manter conectado com a audiência e conversando com ela.
      </div>

      <div
        style={{
          background: `linear-gradient(135deg, ${c.bossSoft} 0%, #FFFFFF 65%)`,
          border: `1px solid ${c.line}`, borderRadius: 14, padding: "18px 22px", marginBottom: 24, position: "relative", overflow: "hidden",
        }}
      >
        <div style={{ position: "absolute", top: 0, left: 0, bottom: 0, width: 3, background: `linear-gradient(180deg, ${c.boss}, ${c.bossDeep})` }} />
        <div style={{ ...sans, fontSize: 10.5, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: c.boss, marginBottom: 8 }}>
          Objetivo deste cronograma
        </div>
        <textarea
          value={objectiveValue}
          onChange={(e) => setObjective(e.target.value)}
          onBlur={() => canManage && objective !== null && saveObjective()}
          readOnly={!canManage}
          rows={2}
          style={{ ...sans, width: "100%", fontSize: 13.5, color: c.ink, lineHeight: 1.55, border: "none", outline: "none", background: "none", resize: "vertical" }}
        />
      </div>

      <div style={{ ...sans, fontSize: 12, color: c.mistLight, marginBottom: 24, display: "flex", alignItems: "center", gap: 6 }}>
        <Sparkles size={12} color={c.boss} /> Carrega num story para veres o passo a passo de como o criar.
      </div>

      {planQuery.isLoading && <div style={{ ...sans, fontSize: 13, color: c.mist, marginBottom: 24 }}>A carregar…</div>}

      <div style={{ display: "grid", gridTemplateColumns: "var(--bb-grid-5, repeat(5, 1fr))", gap: 12, marginBottom: 24 }}>
        {STORY_DAYS.map((d) => (
          <StoryDayColumn
            key={d.key}
            label={d.label}
            ideas={(plan?.days || {})[d.key] || []}
            canManage={canManage}
            onSelect={setSelected}
            onAdd={(idea) => addIdea(d.key, idea)}
          />
        ))}
      </div>

      <div style={{ background: c.bossSoft, borderRadius: 12, padding: "14px 18px", marginBottom: 24, display: "flex", gap: 10, alignItems: "flex-start" }}>
        <Sparkles size={16} color={c.boss} style={{ flexShrink: 0, marginTop: 1 }} />
        <div style={{ ...sans, fontSize: 12.5, color: c.ink, lineHeight: 1.6 }}>
          <strong>Dica de ouro:</strong> pensa em story como uma conversa contínua — a repetição inteligente gera clareza de mensagem.
        </div>
      </div>

      <h2 style={{ ...serif, fontSize: 17, color: c.ink, fontWeight: 500, margin: "0 0 14px" }}>
        Checklist de Análise de Stories
      </h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {STORY_CHECKLIST.map((group) => (
          <div key={group.group} style={{ background: "#fff", border: `1px solid ${c.line}`, borderRadius: 12, padding: "16px 18px" }}>
            <div style={{ ...serif, fontSize: 14.5, color: c.ink, marginBottom: 10 }}>{group.group}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {group.items.map((item, i) => (
                <div key={i} style={{ ...sans, fontSize: 12.5, color: c.mist, display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 4, height: 4, borderRadius: 999, background: c.boss, flexShrink: 0 }} />
                  {item}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {selected && <StoryDetailModal story={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

/* ---------------------------------------------------------
   PROPOSTAS — várias fases, mesmo esqueleto visual, branding próprio
--------------------------------------------------------- */
const PROPOSAL_STATUS = {
  draft: { label: "Rascunho", bg: "#F0EFF4", color: c.mist },
  sent: { label: "Enviada", bg: "#F5EFDF", color: c.amber },
  accepted: { label: "Aceite", bg: "#E7F5EC", color: c.sage },
  rejected: { label: "Recusada", bg: "#FBE9EC", color: c.rose },
};

function PropostaDetail({ proposal: initial, onBack }) {
  const [proposal, onChange] = useState(initial);
  const updateProposal = useUpdateProposal();
  const deleteProposal = useDeleteProposal();

  const updateField = (field, value) => onChange((p) => ({ ...p, [field]: value }));
  const updatePhase = (i, field, value) => {
    onChange((p) => ({ ...p, phases: p.phases.map((ph, idx) => (idx === i ? { ...ph, [field]: value } : ph)) }));
  };
  const addPhase = () => onChange((p) => ({ ...p, phases: [...p.phases, { title: "Nova fase", description: "" }] }));
  const removePhase = (i) => onChange((p) => ({ ...p, phases: p.phases.filter((_, idx) => idx !== i) }));

  return (
    <div className="bb-page" style={{ padding: "8px 40px 60px", maxWidth: 1040 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <button
          onClick={onBack}
          style={{ ...sans, display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: c.mist, background: "none", border: "none", cursor: "pointer" }}
        >
          <ArrowLeft size={14} /> Propostas
        </button>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => updateProposal.mutate(proposal)}
            disabled={updateProposal.isPending}
            style={{ ...sans, display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, color: "#fff", background: c.boss, border: "none", borderRadius: 8, padding: "7px 14px", cursor: "pointer" }}
          >
            {updateProposal.isPending ? "A guardar…" : "Guardar"}
          </button>
          <button
            onClick={() => deleteProposal.mutate(proposal.id, { onSuccess: onBack })}
            style={{ ...sans, display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: c.rose, background: "none", border: `1px solid ${c.line}`, borderRadius: 8, padding: "7px 12px", cursor: "pointer" }}
          >
            <Trash2 size={13} /> Eliminar proposta
          </button>
        </div>
      </div>

      <div
        style={{
          background: `linear-gradient(135deg, ${proposal.brandingColor}18, #FFFFFF 65%)`,
          border: `1px solid ${c.line}`,
          borderRadius: 16,
          padding: "26px 30px",
          marginBottom: 28,
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div style={{ position: "absolute", top: 0, left: 0, bottom: 0, width: 3, background: proposal.brandingColor }} />
        <Eyebrow>Proposta comercial</Eyebrow>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
          <span style={{ ...serif, fontSize: 26, color: c.ink }}>Para</span>
          <input
            value={proposal.clientName}
            onChange={(e) => updateField("clientName", e.target.value)}
            style={{ ...serif, fontSize: 26, color: c.ink, border: "none", outline: "none", background: "none", flex: 1 }}
          />
        </div>
        <div style={{ ...sans, fontSize: 12, color: c.mist, marginBottom: 12 }}>big-boss.app/proposta/{proposal.slug}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ ...sans, fontSize: 11, color: c.mist }}>Estado:</span>
          <select
            value={proposal.status}
            onChange={(e) => updateField("status", e.target.value)}
            style={{ ...sans, fontSize: 12, fontWeight: 600, color: c.ink, border: `1px solid ${c.line}`, borderRadius: 7, padding: "5px 9px", cursor: "pointer" }}
          >
            {Object.entries(PROPOSAL_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          {proposal.status === "sent" || proposal.status === "accepted" ? (
            <span style={{ ...sans, fontSize: 11, color: c.sage }}>Visível publicamente no link acima</span>
          ) : (
            <span style={{ ...sans, fontSize: 11, color: c.mistLight }}>Só "Enviada"/"Aceite" ficam visíveis no link público</span>
          )}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {proposal.phases.map((p, i) => (
          <div key={i} style={{ background: "#fff", border: `1px solid ${c.line}`, borderRadius: 14, padding: "18px 22px", display: "flex", gap: 16 }}>
            <div
              style={{
                width: 30, height: 30, borderRadius: 999, background: `${proposal.brandingColor}1A`, color: proposal.brandingColor,
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, ...sans, fontSize: 12.5, fontWeight: 700,
              }}
            >
              {i + 1}
            </div>
            <div style={{ flex: 1 }}>
              <input
                value={p.title}
                onChange={(e) => updatePhase(i, "title", e.target.value)}
                style={{ ...serif, fontSize: 16, color: c.ink, marginBottom: 4, border: "none", outline: "none", background: "none", width: "100%" }}
              />
              <textarea
                value={p.description}
                onChange={(e) => updatePhase(i, "description", e.target.value)}
                rows={2}
                style={{ ...sans, fontSize: 12.5, color: c.mist, lineHeight: 1.55, border: "none", outline: "none", background: "none", width: "100%", resize: "vertical" }}
              />
            </div>
            <button onClick={() => removePhase(i)} style={{ background: "none", border: "none", cursor: "pointer", color: c.mist, flexShrink: 0, height: "fit-content" }}>
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        <button
          onClick={addPhase}
          style={{
            ...sans, display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, color: c.boss,
            background: c.bossSoft, border: "none", borderRadius: 10, padding: "12px 16px", cursor: "pointer", justifyContent: "center",
          }}
        >
          <Plus size={14} /> Adicionar fase
        </button>
      </div>
    </div>
  );
}

function PropostasModule({ session }) {
  const [openId, setOpenId] = useState(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiClient, setAiClient] = useState("");
  const [aiContext, setAiContext] = useState("");
  const proposalsQuery = useProposals(true);
  const addProposal = useAddProposal();
  const deleteProposal = useDeleteProposal();
  const proposals = proposalsQuery.data || [];
  const openProposal = proposals.find((p) => p.id === openId);
  const colors = [c.boss, "#2F9E63", "#C9821F", "#3B5FC2"];

  const createProposal = async () => {
    const newProposal = await addProposal.mutateAsync({
      session,
      clientName: "Novo cliente",
      brandingColor: colors[proposals.length % colors.length],
      phases: [{ title: "Diagnóstico", description: "Descreve aqui a primeira fase da proposta." }],
    });
    setOpenId(newProposal.id);
  };
  const generateWithAI = async () => {
    const contextLine = aiContext.trim() || "os objetivos descritos para este cliente";
    const newProposal = await addProposal.mutateAsync({
      session,
      clientName: aiClient.trim() || "Novo cliente",
      brandingColor: colors[proposals.length % colors.length],
      aiGenerated: true,
      phases: [
        { title: "Diagnóstico", description: `Auditoria inicial com base em ${contextLine}.` },
        { title: "Estratégia", description: "Definição de posicionamento e plano de ação alinhado com o diagnóstico." },
        { title: "Execução", description: "Produção e implementação do que foi definido na fase estratégica." },
        { title: "Acompanhamento", description: "Relatórios periódicos e ajustes com base nos resultados." },
      ],
    });
    setAiOpen(false);
    setAiClient("");
    setAiContext("");
    setOpenId(newProposal.id);
  };

  if (openProposal) {
    return <PropostaDetail proposal={openProposal} onBack={() => setOpenId(null)} />;
  }

  return (
    <div className="bb-page" style={{ padding: "8px 40px 60px", maxWidth: 1040 }}>
      <Eyebrow>Propostas</Eyebrow>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
        <h1 style={{ ...serif, fontSize: 30, fontWeight: 500, color: c.ink, margin: 0 }}>Propostas comerciais</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => setAiOpen(true)}
            style={{
              ...sans, display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, color: c.boss,
              background: c.bossSoft, border: "none", borderRadius: 8, padding: "9px 14px", cursor: "pointer",
            }}
          >
            <Sparkles size={14} /> Criar com IA
          </button>
          <button
            onClick={createProposal}
            disabled={addProposal.isPending}
            style={{
              ...sans, display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, color: "#fff",
              background: c.boss, border: "none", borderRadius: 8, padding: "9px 16px", cursor: "pointer",
            }}
          >
            <Plus size={14} /> Nova proposta
          </button>
        </div>
      </div>

      {proposalsQuery.isLoading && <div style={{ ...sans, fontSize: 13, color: c.mist, marginBottom: 20 }}>A carregar…</div>}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {proposals.map((p) => {
          const st = PROPOSAL_STATUS[p.status];
          return (
            <div
              key={p.id}
              onClick={() => setOpenId(p.id)}
              style={{
                display: "flex", alignItems: "center", gap: 14, background: "#fff",
                border: `1px solid ${c.line}`, borderRadius: 12, padding: "14px 18px", cursor: "pointer",
              }}
            >
              <div style={{ width: 8, height: 34, borderRadius: 4, background: p.brandingColor, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ ...serif, fontSize: 15.5, color: c.ink, fontWeight: 500 }}>{p.clientName}</div>
                <div style={{ ...sans, fontSize: 12, color: c.mist, marginTop: 2 }}>
                  {p.phases.length} fases · /proposta/{p.slug}
                </div>
              </div>
              <span style={{ ...sans, fontSize: 11.5, fontWeight: 600, color: st.color, background: st.bg, borderRadius: 999, padding: "4px 10px" }}>
                {st.label}
              </span>
              <button
                onClick={(e) => { e.stopPropagation(); deleteProposal.mutate(p.id); }}
                style={{ background: "none", border: "none", cursor: "pointer", color: c.mist, padding: 4, flexShrink: 0 }}
              >
                <Trash2 size={15} />
              </button>
              <ChevronRight size={16} color={c.mist} />
            </div>
          );
        })}
        {!proposalsQuery.isLoading && proposals.length === 0 && (
          <div style={{ ...sans, fontSize: 13, color: c.mistLight, textAlign: "center", padding: "40px 0" }}>
            Ainda sem propostas — cria a primeira acima.
          </div>
        )}
      </div>

      {aiOpen && (
        <div onClick={() => setAiOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(23,21,31,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 20, overflowY: "auto" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, padding: 26, maxWidth: 420, width: "100%", maxHeight: "85vh", overflowY: "auto", margin: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <Sparkles size={16} color={c.boss} />
              <span style={{ ...sans, fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: c.boss }}>Criar com IA</span>
            </div>
            <div style={{ ...serif, fontSize: 18, color: c.ink, marginBottom: 18 }}>Responde a duas perguntas</div>

            <div style={{ marginBottom: 14 }}>
              <div style={{ ...sans, fontSize: 11.5, color: c.mist, marginBottom: 5 }}>Nome do cliente</div>
              <input
                value={aiClient}
                onChange={(e) => setAiClient(e.target.value)}
                placeholder="Ex: Luís Silva"
                style={{ ...sans, width: "100%", fontSize: 13, border: `1px solid ${c.line}`, borderRadius: 8, padding: "9px 12px", outline: "none", color: c.ink }}
              />
            </div>
            <div style={{ marginBottom: 20 }}>
              <div style={{ ...sans, fontSize: 11.5, color: c.mist, marginBottom: 5 }}>O que este cliente precisa?</div>
              <textarea
                value={aiContext}
                onChange={(e) => setAiContext(e.target.value)}
                rows={3}
                placeholder="Ex: gestão de redes sociais e campanhas pagas para aumentar clientes"
                style={{ ...sans, width: "100%", fontSize: 13, border: `1px solid ${c.line}`, borderRadius: 8, padding: "9px 12px", outline: "none", color: c.ink, resize: "vertical" }}
              />
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={generateWithAI}
                style={{ ...sans, flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 13, fontWeight: 600, color: "#fff", background: c.boss, border: "none", borderRadius: 8, padding: "10px 14px", cursor: "pointer" }}
              >
                <Sparkles size={14} /> Gerar proposta
              </button>
              <button
                onClick={() => setAiOpen(false)}
                style={{ ...sans, fontSize: 13, color: c.mist, background: "none", border: `1px solid ${c.line}`, borderRadius: 8, padding: "10px 14px", cursor: "pointer" }}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------
   CENTRO DE COMANDO — Calendário Geral / Pessoal / Minhas Tarefas
--------------------------------------------------------- */
function CalendarioGeral() {
  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginBottom: 18 }}>
        {CALENDAR_LEGEND.map((l) => (
          <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 6, ...sans, fontSize: 11.5, color: c.mist }}>
            <span style={{ width: 8, height: 8, borderRadius: 3, background: l.color }} />
            {l.label}
          </div>
        ))}
      </div>
      <div style={{ overflowX: "auto" }}>
        <div style={{ minWidth: 640 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8, marginBottom: 8 }}>
            {["SEG", "TER", "QUA", "QUI", "SEX", "SÁB", "DOM"].map((d) => (
              <div key={d} style={{ ...sans, fontSize: 10.5, fontWeight: 600, color: c.mistLight, textAlign: "center", letterSpacing: "0.06em" }}>
                {d}
              </div>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8 }}>
            {CALENDAR_DAYS.map((d, i) => (
              <div
                key={i}
                style={{
                  background: "#fff", border: `1px solid ${c.line}`, borderRadius: 10, padding: 8, minHeight: 84,
                  opacity: d.month === "jun" ? 0.5 : 1,
                }}
              >
                <div style={{ ...sans, fontSize: 11, color: d.day === 4 ? c.boss : c.mist, fontWeight: d.day === 4 ? 700 : 500, marginBottom: 6 }}>
                  {d.day}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  {d.events.map((e, j) => (
                    <div
                      key={j}
                      style={{
                        ...sans, fontSize: 9, color: "#fff", background: e.color, borderRadius: 4, padding: "2px 5px",
                        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                      }}
                    >
                  {e.label}
                </div>
              ))}
            </div>
          </div>
        ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function CalendarioPessoal() {
  return (
    <div>
      <h2 style={{ ...serif, fontSize: 16, color: c.ink, fontWeight: 500, margin: "0 0 12px" }}>Pendências (sem dia definido)</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 24 }}>
        {PERSONAL_PENDING.map((t) => (
          <div key={t.id} style={{ background: t.color, borderRadius: 10, padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ ...sans, fontSize: 12.5, color: c.ink }}>{t.text}</span>
            <span style={{ ...sans, fontSize: 10.5, color: c.mist }}>{t.tag}</span>
          </div>
        ))}
      </div>
      <h2 style={{ ...serif, fontSize: 16, color: c.ink, fontWeight: 500, margin: "0 0 12px" }}>Tarefas por dia da semana</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {PERSONAL_BY_DAY.map((d) => (
          <div key={d.day}>
            <div style={{ ...sans, fontSize: 12, fontWeight: 600, color: c.ink, marginBottom: 8 }}>{d.day}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {d.tasks.map((t, i) => (
                <div key={i} style={{ background: "#fff", border: `1px solid ${c.line}`, borderRadius: 8, padding: "9px 12px", ...sans, fontSize: 12.5, color: c.ink }}>
                  {t}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MinhasTarefas({ session }) {
  const [newText, setNewText] = useState("");
  const tasksQuery = usePersonalTasks(session, session.role === "admin_geral");
  const addTask = useAddPersonalTask(session);
  const toggleTask = useTogglePersonalTask(session);
  const deleteTask = useDeletePersonalTask(session);
  const tasks = tasksQuery.data || [];

  if (session.role !== "admin_geral") {
    return <div style={{ ...sans, fontSize: 13, color: c.mist }}>Só disponível para o Admin Geral.</div>;
  }

  const submitNew = () => {
    if (!newText.trim()) return;
    addTask.mutate(newText.trim());
    setNewText("");
  };

  return (
    <div style={{ maxWidth: 480 }}>
      {tasksQuery.isLoading && <div style={{ ...sans, fontSize: 13, color: c.mist, marginBottom: 10 }}>A carregar…</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 2, marginBottom: 12 }}>
        {tasks.map((t) => (
          <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 4px" }}>
            <button
              onClick={() => toggleTask.mutate({ id: t.id, done: !t.done })}
              style={{ display: "flex", alignItems: "center", gap: 10, background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "left", flex: 1 }}
            >
              {t.done ? (
                <CheckCircle2 size={16} color={c.sage} strokeWidth={2} style={{ flexShrink: 0 }} />
              ) : (
                <span style={{ width: 16, height: 16, borderRadius: 999, border: `1.5px solid ${c.line}`, flexShrink: 0 }} />
              )}
              <span style={{ ...sans, fontSize: 13.5, color: t.done ? c.mist : c.ink, textDecoration: t.done ? "line-through" : "none" }}>
                {t.text}
              </span>
            </button>
            <button onClick={() => deleteTask.mutate(t.id)} style={{ background: "none", border: "none", cursor: "pointer", color: c.mist, padding: 2, flexShrink: 0 }}>
              <Trash2 size={13} />
            </button>
          </div>
        ))}
        {!tasksQuery.isLoading && tasks.length === 0 && (
          <div style={{ ...sans, fontSize: 13, color: c.mistLight, padding: "8px 4px" }}>Ainda sem tarefas.</div>
        )}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submitNew()}
          placeholder="Nova tarefa..."
          style={{ ...sans, flex: 1, fontSize: 12.5, border: `1px solid ${c.line}`, borderRadius: 8, padding: "8px 12px", outline: "none", color: c.ink }}
        />
        <button
          onClick={submitNew}
          style={{ width: 34, height: 34, borderRadius: 8, background: c.boss, border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}
        >
          <Plus size={15} color="#fff" />
        </button>
      </div>
    </div>
  );
}

function CentroComandoModule({ session }) {
  const [tab, setTab] = useState("geral");
  const tabs = [
    { key: "geral", label: "Calendário Geral" },
    { key: "pessoal", label: "Calendário Pessoal" },
    { key: "tarefas", label: "Minhas Tarefas" },
  ];
  return (
    <div className="bb-page" style={{ padding: "8px 40px 60px", maxWidth: 1040 }}>
      <Eyebrow>Centro de Comando</Eyebrow>
      <h1 style={{ ...serif, fontSize: 30, fontWeight: 500, color: c.ink, margin: "0 0 22px" }}>
        Visão operacional
      </h1>
      <div style={{ display: "flex", gap: 4, background: "#fff", border: `1px solid ${c.line}`, borderRadius: 10, padding: 4, marginBottom: 24, width: "fit-content" }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              ...sans, fontSize: 12.5, fontWeight: 600, padding: "8px 14px", borderRadius: 7, border: "none", cursor: "pointer",
              color: tab === t.key ? "#fff" : c.mist, background: tab === t.key ? c.boss : "transparent",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "geral" && <CalendarioGeral />}
      {tab === "pessoal" && <CalendarioPessoal />}
      {tab === "tarefas" && <MinhasTarefas session={session} />}
    </div>
  );
}

/* ---------------------------------------------------------
   BASE DE CONHECIMENTO — SOPs interativos (não PDF)
--------------------------------------------------------- */
function ArticleDetail({ article, onBack, onDelete }) {
  return (
    <div className="bb-page" style={{ padding: "8px 40px 60px", maxWidth: 720 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <button
          onClick={onBack}
          style={{ ...sans, display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: c.mist, background: "none", border: "none", cursor: "pointer" }}
        >
          <ArrowLeft size={14} /> Base de Conhecimento
        </button>
        <button
          onClick={onDelete}
          style={{ ...sans, display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: c.rose, background: "none", border: `1px solid ${c.line}`, borderRadius: 8, padding: "7px 12px", cursor: "pointer" }}
        >
          <Trash2 size={13} /> Eliminar
        </button>
      </div>
      <span style={{ ...sans, fontSize: 10.5, fontWeight: 700, color: c.boss, background: c.bossSoft, borderRadius: 6, padding: "3px 8px" }}>
        {article.category}
      </span>
      <h1 style={{ ...serif, fontSize: 26, fontWeight: 500, color: c.ink, margin: "12px 0 24px" }}>{article.title}</h1>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {article.steps.map((s, i) => (
          <div key={i} style={{ display: "flex", gap: 14, background: "#fff", border: `1px solid ${c.line}`, borderRadius: 12, padding: "14px 16px" }}>
            <span
              style={{
                ...sans, fontSize: 11.5, fontWeight: 700, color: c.boss, background: c.bossSoft, borderRadius: 999,
                width: 22, height: 22, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              {i + 1}
            </span>
            <span style={{ ...sans, fontSize: 13.5, color: c.ink, lineHeight: 1.6, paddingTop: 1 }}>{s}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function BaseConhecimentoModule({ session }) {
  const [openId, setOpenId] = useState(null);
  const articlesQuery = useArticles(true);
  const addArticle = useAddArticle();
  const deleteArticle = useDeleteArticle();
  const articles = articlesQuery.data || [];
  const article = articles.find((a) => a.id === openId);

  const createArticle = async () => {
    const newArticle = await addArticle.mutateAsync({ session, title: "Novo artigo" });
    setOpenId(newArticle.id);
  };

  if (article) {
    return (
      <ArticleDetail
        article={article}
        onBack={() => setOpenId(null)}
        onDelete={() => deleteArticle.mutate(article.id, { onSuccess: () => setOpenId(null) })}
      />
    );
  }

  return (
    <div className="bb-page" style={{ padding: "8px 40px 60px", maxWidth: 1040 }}>
      <Eyebrow>Base de Conhecimento</Eyebrow>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <h1 style={{ ...serif, fontSize: 30, fontWeight: 500, color: c.ink, margin: 0 }}>SOPs e tutoriais</h1>
        <button
          onClick={createArticle}
          disabled={addArticle.isPending}
          style={{
            ...sans, display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, color: "#fff",
            background: c.boss, border: "none", borderRadius: 8, padding: "9px 16px", cursor: "pointer",
          }}
        >
          <Plus size={14} /> Novo artigo
        </button>
      </div>

      {articlesQuery.isLoading && <div style={{ ...sans, fontSize: 13, color: c.mist }}>A carregar…</div>}
      {!articlesQuery.isLoading && articles.length === 0 && (
        <div style={{ ...sans, fontSize: 13, color: c.mistLight, textAlign: "center", padding: "40px 0" }}>
          Ainda sem artigos — cria o primeiro acima.
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "var(--bb-grid-3, repeat(3, 1fr))", gap: 14 }}>
        {articles.map((a) => (
          <div
            key={a.id}
            onClick={() => setOpenId(a.id)}
            style={{ position: "relative", textAlign: "left", background: "#fff", border: `1px solid ${c.line}`, borderRadius: 14, padding: 20, cursor: "pointer" }}
          >
            <button
              onClick={(e) => { e.stopPropagation(); deleteArticle.mutate(a.id); }}
              style={{ position: "absolute", top: 14, right: 14, background: "none", border: "none", cursor: "pointer", color: c.mistLight }}
            >
              <Trash2 size={14} />
            </button>
            <BookMarked size={18} color={c.boss} strokeWidth={1.7} />
            <div style={{ ...serif, fontSize: 15, color: c.ink, fontWeight: 500, marginTop: 12 }}>{a.title}</div>
            <span style={{ ...sans, fontSize: 10, fontWeight: 700, color: c.mist, background: c.paper, borderRadius: 6, padding: "2px 6px", display: "inline-block", marginTop: 8 }}>
              {a.category}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
   PORTFÓLIO — construtor de apresentações
--------------------------------------------------------- */
function SlideThumb({ slide, brandingColor }) {
  const Icon = (SLIDE_LAYOUTS.find((l) => l.key === slide.type) || {}).icon || FileText;
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 6, overflow: "hidden" }}>
      <Icon size={12} color={brandingColor} strokeWidth={2} style={{ marginBottom: 4, flexShrink: 0 }} />
      <div style={{ ...sans, fontSize: 6.5, color: c.mist, textAlign: "center", lineHeight: 1.3, width: "100%", overflow: "hidden" }}>
        {(slide.heading || slide.quote || slide.value || "Slide").slice(0, 40)}
      </div>
    </div>
  );
}

function SlideCanvas({ slide, brandingColor, updateSlide, onImageUpload }) {
  const boxStyle = {
    background: "#fff", border: `1px solid ${c.line}`, borderRadius: 16, minHeight: 340,
    display: "flex", flexDirection: "column", justifyContent: "center", position: "relative", overflow: "hidden",
    padding: "44px 40px",
  };
  const accentBar = <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: brandingColor }} />;

  if (slide.type === "stat") {
    return (
      <div style={boxStyle}>
        {accentBar}
        <input
          value={slide.value}
          onChange={(e) => updateSlide("value", e.target.value)}
          style={{ ...serif, fontSize: 56, color: brandingColor, border: "none", outline: "none", background: "none", width: "100%", marginBottom: 8 }}
        />
        <input
          value={slide.label}
          onChange={(e) => updateSlide("label", e.target.value)}
          style={{ ...sans, fontSize: 15, fontWeight: 600, color: c.ink, border: "none", outline: "none", background: "none", width: "100%", marginBottom: 14 }}
        />
        <textarea
          value={slide.body}
          onChange={(e) => updateSlide("body", e.target.value)}
          rows={2}
          style={{ ...sans, fontSize: 13, color: c.mist, lineHeight: 1.6, border: "none", outline: "none", background: "none", resize: "vertical", width: "100%", maxWidth: 460 }}
        />
      </div>
    );
  }

  if (slide.type === "quote") {
    return (
      <div style={{ ...boxStyle, alignItems: "center", textAlign: "center" }}>
        {accentBar}
        <Sparkles size={20} color={brandingColor} style={{ marginBottom: 16 }} />
        <textarea
          value={slide.quote}
          onChange={(e) => updateSlide("quote", e.target.value)}
          rows={3}
          style={{ ...serif, fontSize: 21, color: c.ink, lineHeight: 1.5, border: "none", outline: "none", background: "none", resize: "vertical", width: "100%", maxWidth: 500, textAlign: "center", marginBottom: 12 }}
        />
        <input
          value={slide.author}
          onChange={(e) => updateSlide("author", e.target.value)}
          style={{ ...sans, fontSize: 12.5, color: c.mist, border: "none", outline: "none", background: "none", textAlign: "center", width: "100%" }}
        />
      </div>
    );
  }

  if (slide.type === "image") {
    return (
      <div style={{ ...boxStyle, padding: 0 }}>
        {accentBar}
        <label
          style={{
            height: 200, cursor: "pointer", flexShrink: 0,
            background: slide.imageUrl ? `url(${slide.imageUrl}) center/cover` : c.paper,
            display: "flex", alignItems: "center", justifyContent: "center", borderBottom: `1px solid ${c.line}`,
          }}
        >
          <input type="file" accept="image/*" onChange={onImageUpload} style={{ display: "none" }} />
          {!slide.imageUrl && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <Plus size={18} color={c.mist} />
              <span style={{ ...sans, fontSize: 12, color: c.mist }}>Carregar imagem</span>
            </div>
          )}
          {slide.imageUrl && (
            <span style={{ ...sans, fontSize: 11, fontWeight: 600, color: "#fff", background: "rgba(0,0,0,0.45)", borderRadius: 999, padding: "4px 10px" }}>Trocar imagem</span>
          )}
        </label>
        <div style={{ padding: "22px 30px" }}>
          <input
            value={slide.heading}
            onChange={(e) => updateSlide("heading", e.target.value)}
            style={{ ...serif, fontSize: 22, color: c.ink, border: "none", outline: "none", background: "none", width: "100%", marginBottom: 8 }}
          />
          <textarea
            value={slide.body}
            onChange={(e) => updateSlide("body", e.target.value)}
            rows={2}
            style={{ ...sans, fontSize: 13, color: c.mist, lineHeight: 1.6, border: "none", outline: "none", background: "none", resize: "vertical", width: "100%" }}
          />
        </div>
      </div>
    );
  }

  if (slide.type === "video") {
    return (
      <div style={boxStyle}>
        {accentBar}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, background: c.paper, borderRadius: 10, padding: "10px 14px" }}>
          <Video size={18} color={brandingColor} strokeWidth={1.8} />
          <input
            value={slide.body}
            onChange={(e) => updateSlide("body", e.target.value)}
            placeholder="nome-do-ficheiro.mp4"
            style={{ ...sans, fontSize: 12.5, color: c.ink, border: "none", outline: "none", background: "none", flex: 1 }}
          />
        </div>
        <input
          value={slide.heading}
          onChange={(e) => updateSlide("heading", e.target.value)}
          style={{ ...serif, fontSize: 24, color: c.ink, border: "none", outline: "none", background: "none", width: "100%" }}
        />
      </div>
    );
  }

  if (slide.type === "split") {
    return (
      <div style={boxStyle}>
        {accentBar}
        <input
          value={slide.heading}
          onChange={(e) => updateSlide("heading", e.target.value)}
          style={{ ...serif, fontSize: 22, color: c.ink, border: "none", outline: "none", background: "none", width: "100%", marginBottom: 18 }}
        />
        <div style={{ display: "grid", gridTemplateColumns: "var(--bb-grid-2, 1fr 1fr)", gap: 14 }}>
          <div style={{ background: c.paper, borderRadius: 10, padding: "16px 18px" }}>
            <div style={{ width: 8, height: 8, borderRadius: 999, background: brandingColor, marginBottom: 10 }} />
            <input
              value={slide.leftLabel}
              onChange={(e) => updateSlide("leftLabel", e.target.value)}
              style={{ ...sans, fontSize: 13, fontWeight: 600, color: c.ink, border: "none", outline: "none", background: "none", width: "100%" }}
            />
          </div>
          <div style={{ background: c.paper, borderRadius: 10, padding: "16px 18px" }}>
            <div style={{ width: 8, height: 8, borderRadius: 999, background: brandingColor, marginBottom: 10 }} />
            <input
              value={slide.rightLabel}
              onChange={(e) => updateSlide("rightLabel", e.target.value)}
              style={{ ...sans, fontSize: 13, fontWeight: 600, color: c.ink, border: "none", outline: "none", background: "none", width: "100%" }}
            />
          </div>
        </div>
      </div>
    );
  }

  // "title" (default)
  return (
    <div style={boxStyle}>
      {accentBar}
      <FileText size={20} color={brandingColor} style={{ marginBottom: 14 }} />
      <input
        value={slide.heading}
        onChange={(e) => updateSlide("heading", e.target.value)}
        style={{ ...serif, fontSize: 30, color: c.ink, marginBottom: 6, maxWidth: 560, border: "none", outline: "none", background: "none", width: "100%" }}
      />
      <input
        value={slide.subheading || ""}
        onChange={(e) => updateSlide("subheading", e.target.value)}
        placeholder="Subtítulo (opcional)"
        style={{ ...sans, fontSize: 14, fontWeight: 600, color: brandingColor, marginBottom: 14, border: "none", outline: "none", background: "none", width: "100%" }}
      />
      <textarea
        value={slide.body}
        onChange={(e) => updateSlide("body", e.target.value)}
        rows={2}
        style={{ ...sans, fontSize: 14, color: c.mist, maxWidth: 480, lineHeight: 1.6, border: "none", outline: "none", background: "none", resize: "vertical", width: "100%" }}
      />
    </div>
  );
}

const SLIDE_DEFAULTS = {
  title: { heading: "Novo título", subheading: "", body: "Escreve aqui o conteúdo." },
  stat: { value: "+0%", label: "Nome da métrica", body: "Contexto do resultado." },
  quote: { quote: "Escreve aqui o testemunho.", author: "Nome do cliente" },
  image: { heading: "Novo slide", body: "Legenda da imagem.", imageUrl: null },
  video: { heading: "Novo vídeo", body: "nome-do-ficheiro.mp4" },
  split: { heading: "Comparação", leftLabel: "Coluna A", rightLabel: "Coluna B", body: "" },
};

function PortfolioViewer({ deck: initial, onBack }) {
  const [deck, onChange] = useState(initial);
  const [i, setI] = useState(0);
  const [pickingLayout, setPickingLayout] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const slide = deck.slides[i];
  const updateDeck = useUpdateDeck();
  const deleteDeck = useDeleteDeck();

  const updateSlide = (field, value) => {
    onChange((d) => ({ ...d, slides: d.slides.map((s, idx) => (idx === i ? { ...s, [field]: value } : s)) }));
  };
  const changeSlideType = (newType) => {
    if (newType === slide.type) return;
    const keep = {};
    if (slide.heading) keep.heading = slide.heading;
    if (slide.body) keep.body = slide.body;
    const nextSlide = { type: newType, ...SLIDE_DEFAULTS[newType], ...keep };
    onChange((d) => ({ ...d, slides: d.slides.map((s, idx) => (idx === i ? nextSlide : s)) }));
  };
  const onImageUpload = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const url = await uploadPortfolioImage(deck.id, file);
      updateSlide("imageUrl", url);
    } catch (err) {
      setError(err.message || "Não foi possível carregar a imagem.");
    } finally {
      setUploading(false);
    }
  };
  const addSlide = (layout) => {
    onChange((d) => ({ ...d, slides: [...d.slides, { type: layout, ...SLIDE_DEFAULTS[layout] }] }));
    setI(deck.slides.length);
    setPickingLayout(false);
  };
  const removeSlide = (idx) => {
    if (deck.slides.length <= 1) return;
    onChange((d) => ({ ...d, slides: d.slides.filter((_, x) => x !== idx) }));
    setI((p) => Math.max(0, Math.min(p, deck.slides.length - 2)));
  };
  const moveSlide = (idx, dir) => {
    const swapWith = idx + dir;
    if (swapWith < 0 || swapWith >= deck.slides.length) return;
    onChange((d) => {
      const slides = [...d.slides];
      [slides[idx], slides[swapWith]] = [slides[swapWith], slides[idx]];
      return { ...d, slides };
    });
    setI(swapWith);
  };

  return (
    <div className="bb-page" style={{ padding: "8px 40px 60px", maxWidth: 1180 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <button
          onClick={onBack}
          style={{ ...sans, display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: c.mist, background: "none", border: "none", cursor: "pointer" }}
        >
          <ArrowLeft size={14} /> Portfólio
        </button>
        <input
          value={deck.title}
          onChange={(e) => onChange((d) => ({ ...d, title: e.target.value }))}
          style={{ ...serif, fontSize: 16, color: c.ink, border: "none", outline: "none", background: "none", textAlign: "center", flex: 1, minWidth: 160 }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <input
            type="color"
            value={deck.brandingColor}
            onChange={(e) => onChange((d) => ({ ...d, brandingColor: e.target.value }))}
            style={{ width: 30, height: 30, border: `1px solid ${c.line}`, borderRadius: 7, cursor: "pointer", padding: 2 }}
          />
          <button
            onClick={() => updateDeck.mutate(deck)}
            disabled={updateDeck.isPending}
            style={{ ...sans, display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, color: "#fff", background: c.boss, border: "none", borderRadius: 8, padding: "7px 14px", cursor: "pointer" }}
          >
            {updateDeck.isPending ? "A guardar…" : "Guardar"}
          </button>
          <button
            onClick={() => deleteDeck.mutate(deck.id, { onSuccess: onBack })}
            style={{ ...sans, display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: c.rose, background: "none", border: `1px solid ${c.line}`, borderRadius: 8, padding: "7px 12px", cursor: "pointer" }}
          >
            <Trash2 size={13} /> Eliminar
          </button>
        </div>
      </div>
      {error && <div style={{ ...sans, fontSize: 12, color: c.rose, marginBottom: 10 }}>{error}</div>}
      {uploading && <div style={{ ...sans, fontSize: 12, color: c.mist, marginBottom: 10 }}>A carregar imagem…</div>}

      <div style={{ display: "grid", gridTemplateColumns: "var(--bb-split, 130px 1fr)", gap: 18 }}>
        {/* trilho de miniaturas */}
        <div style={{ display: "flex", flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {deck.slides.map((s, idx) => (
            <div key={idx} style={{ position: "relative" }}>
              <button
                onClick={() => setI(idx)}
                style={{
                  width: 92, height: 62, borderRadius: 8, cursor: "pointer", padding: 0,
                  background: "#fff", border: idx === i ? `2px solid ${deck.brandingColor}` : `1px solid ${c.line}`,
                }}
              >
                <SlideThumb slide={s} brandingColor={deck.brandingColor} />
              </button>
              <div style={{ display: "flex", justifyContent: "center", gap: 3, marginTop: 3 }}>
                <button onClick={() => moveSlide(idx, -1)} disabled={idx === 0} style={{ background: "none", border: "none", cursor: idx === 0 ? "default" : "pointer", color: idx === 0 ? c.line : c.mist, padding: 1 }}>
                  <ChevronUp size={11} />
                </button>
                <button onClick={() => moveSlide(idx, 1)} disabled={idx === deck.slides.length - 1} style={{ background: "none", border: "none", cursor: idx === deck.slides.length - 1 ? "default" : "pointer", color: idx === deck.slides.length - 1 ? c.line : c.mist, padding: 1 }}>
                  <ChevronDown size={11} />
                </button>
                <button onClick={() => removeSlide(idx)} disabled={deck.slides.length <= 1} style={{ background: "none", border: "none", cursor: deck.slides.length <= 1 ? "default" : "pointer", color: deck.slides.length <= 1 ? c.line : c.rose, padding: 1 }}>
                  <Trash2 size={11} />
                </button>
              </div>
            </div>
          ))}
          <button
            onClick={() => setPickingLayout((v) => !v)}
            style={{
              width: 92, height: 62, borderRadius: 8, cursor: "pointer", border: `1.5px dashed ${c.line}`, background: c.paper,
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3,
            }}
          >
            <Plus size={14} color={c.mist} />
            <span style={{ ...sans, fontSize: 9, color: c.mist }}>Slide</span>
          </button>
        </div>

        {/* canvas */}
        <div>
          {pickingLayout && (
            <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", background: "#fff", border: `1px solid ${c.line}`, borderRadius: 12, padding: 12 }}>
              {SLIDE_LAYOUTS.map((l) => {
                const LIcon = l.icon;
                return (
                  <button
                    key={l.key}
                    onClick={() => addSlide(l.key)}
                    style={{
                      ...sans, display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: c.ink,
                      background: c.paper, border: `1px solid ${c.line}`, borderRadius: 8, padding: "7px 11px", cursor: "pointer",
                    }}
                  >
                    <LIcon size={13} color={deck.brandingColor} /> {l.label}
                  </button>
                );
              })}
            </div>
          )}

          <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
            {SLIDE_LAYOUTS.map((l) => (
              <button
                key={l.key}
                onClick={() => changeSlideType(l.key)}
                style={{
                  ...sans, fontSize: 10.5, fontWeight: 600, borderRadius: 999, padding: "3px 9px", border: "none", cursor: "pointer",
                  color: slide.type === l.key ? "#fff" : c.mist,
                  background: slide.type === l.key ? deck.brandingColor : c.paper,
                }}
              >
                {l.label}
              </button>
            ))}
          </div>

          <SlideCanvas slide={slide} brandingColor={deck.brandingColor} updateSlide={updateSlide} onImageUpload={onImageUpload} />

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 14 }}>
            <button
              onClick={() => setI((p) => Math.max(0, p - 1))}
              disabled={i === 0}
              style={{ ...sans, fontSize: 12.5, fontWeight: 600, color: i === 0 ? c.mistLight : c.boss, background: "none", border: "none", cursor: i === 0 ? "default" : "pointer" }}
            >
              ← Anterior
            </button>
            <span style={{ ...sans, fontSize: 11.5, color: c.mist }}>{i + 1} / {deck.slides.length}</span>
            <button
              onClick={() => setI((p) => Math.min(deck.slides.length - 1, p + 1))}
              disabled={i === deck.slides.length - 1}
              style={{ ...sans, fontSize: 12.5, fontWeight: 600, color: i === deck.slides.length - 1 ? c.mistLight : c.boss, background: "none", border: "none", cursor: i === deck.slides.length - 1 ? "default" : "pointer" }}
            >
              Seguinte →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PortfolioModule({ session }) {
  const [openId, setOpenId] = useState(null);
  const decksQuery = useDecks(true);
  const addDeck = useAddDeck();
  const deleteDeck = useDeleteDeck();
  const decks = decksQuery.data || [];
  const deck = decks.find((d) => d.id === openId);
  const colors = [c.boss, "#2F9E63", "#C9821F", "#3B5FC2"];

  const createDeck = async () => {
    const newDeck = await addDeck.mutateAsync({
      session,
      title: "Nova apresentação",
      brandingColor: colors[decks.length % colors.length],
      slides: [{ type: "title", heading: "Primeiro slide", subheading: "", body: "Escreve aqui o conteúdo." }],
    });
    setOpenId(newDeck.id);
  };

  const onUploadDeck = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const newDeck = await addDeck.mutateAsync({
      session,
      title: file.name.replace(/\.[^/.]+$/, ""),
      brandingColor: colors[decks.length % colors.length],
      slides: [
        { type: "title", heading: "Apresentação carregada", subheading: file.name, body: "Recria aqui os slides para ficarem editáveis e com o branding certo." },
      ],
    });
    setOpenId(newDeck.id);
    e.target.value = "";
  };

  if (deck) return <PortfolioViewer deck={deck} onBack={() => setOpenId(null)} />;

  return (
    <div className="bb-page" style={{ padding: "8px 40px 60px", maxWidth: 1040 }}>
      <Eyebrow>Portfólio</Eyebrow>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <h1 style={{ ...serif, fontSize: 30, fontWeight: 500, color: c.ink, margin: 0 }}>Apresentações</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <label
            style={{
              ...sans, display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, color: c.boss,
              background: c.bossSoft, border: "none", borderRadius: 8, padding: "9px 14px", cursor: "pointer",
            }}
          >
            <input type="file" accept=".pdf,.ppt,.pptx,.key" onChange={onUploadDeck} style={{ display: "none" }} />
            <ImageIcon size={14} /> Carregar existente
          </label>
          <button
            onClick={createDeck}
            disabled={addDeck.isPending}
            style={{
              ...sans, display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, color: "#fff",
              background: c.boss, border: "none", borderRadius: 8, padding: "9px 16px", cursor: "pointer",
            }}
          >
            <Plus size={14} /> Nova apresentação
          </button>
        </div>
      </div>
      <div style={{ ...sans, fontSize: 12, color: c.mist, marginBottom: 20, maxWidth: 560, lineHeight: 1.6 }}>
        3 modelos já vêm prontos a editar — ou carrega uma apresentação que já tenhas para a recriares aqui dentro, com branding próprio.
      </div>

      {decksQuery.isLoading && <div style={{ ...sans, fontSize: 13, color: c.mist }}>A carregar…</div>}

      <div style={{ display: "grid", gridTemplateColumns: "var(--bb-grid-3, repeat(3, 1fr))", gap: 14 }}>
        {decks.map((d) => (
          <div
            key={d.id}
            onClick={() => setOpenId(d.id)}
            style={{ position: "relative", textAlign: "left", background: "#fff", border: `1px solid ${c.line}`, borderRadius: 14, padding: 20, cursor: "pointer" }}
          >
            <button
              onClick={(e) => { e.stopPropagation(); deleteDeck.mutate(d.id); }}
              style={{ position: "absolute", top: 14, right: 14, background: "none", border: "none", cursor: "pointer", color: c.mistLight }}
            >
              <Trash2 size={14} />
            </button>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: `${d.brandingColor}1A`, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
              <Layers size={16} color={d.brandingColor} strokeWidth={1.8} />
            </div>
            <div style={{ ...serif, fontSize: 15, color: c.ink, fontWeight: 500 }}>{d.title}</div>
            <div style={{ ...sans, fontSize: 11.5, color: c.mist, marginTop: 4 }}>{d.slides.length} slides</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
   LINK NA BIO — construtor completo, editável em tempo real
--------------------------------------------------------- */
function hexToRgba(hex, alphaPct) {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alphaPct / 100})`;
}

function bgStyle(bg) {
  if (bg.type === "color") return { background: bg.colorValue };
  if (bg.type === "photo") {
    if (!bg.photoUrl) {
      return { background: `repeating-linear-gradient(45deg, #EDEAF5, #EDEAF5 10px, #E4DFF2 10px, #E4DFF2 20px)` };
    }
    const overlay = bg.overlay.enabled
      ? `linear-gradient(${bg.overlay.direction}, ${hexToRgba(bg.overlay.color, bg.overlay.intensity)}, transparent 65%), `
      : "";
    return {
      backgroundImage: `${overlay}url(${bg.photoUrl})`,
      backgroundSize: "cover",
      backgroundPosition: "center",
    };
  }
  return { background: `linear-gradient(${bg.gradientAngle}deg, ${bg.gradientFrom}, ${bg.gradientTo})` };
}

function SocialRow({ platforms, size = 15 }) {
  return (
    <div style={{ display: "flex", justifyContent: "center", gap: 10 }}>
      {platforms.map((key) => {
        const p = SOCIAL_PLATFORMS.find((s) => s.key === key);
        if (!p) return null;
        const Icon = p.icon;
        return (
          <div
            key={key}
            style={{ width: 30, height: 30, borderRadius: 999, background: "rgba(255,255,255,0.16)", display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            <Icon size={size} color="#fff" strokeWidth={1.8} />
          </div>
        );
      })}
    </div>
  );
}

function LinkPagePreview({ page }) {
  return (
    <div
      style={{
        ...bgStyle(page.bg), borderRadius: 28, padding: "30px 20px",
        display: "flex", flexDirection: "column", alignItems: "center", boxShadow: "0 12px 30px rgba(30,20,50,0.25)",
      }}
    >
      <div
        style={{
          width: 60, height: 60, borderRadius: 999, marginBottom: 10, flexShrink: 0,
          background: page.avatarUrl ? `url(${page.avatarUrl}) center/cover` : "rgba(255,255,255,0.2)",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: page.avatarBgRemoved ? "0 0 0 3px rgba(255,255,255,0.7)" : "none",
        }}
      >
        {!page.avatarUrl && <ImageIcon size={18} color="rgba(255,255,255,0.75)" />}
      </div>
      <div style={{ ...serif, fontSize: 15, color: "#fff", marginBottom: 4, textShadow: "0 1px 4px rgba(0,0,0,0.3)" }}>{page.ownerName}</div>
      <div style={{ ...sans, fontSize: 10.5, color: "rgba(255,255,255,0.85)", textAlign: "center", marginBottom: 20, lineHeight: 1.5, textShadow: "0 1px 4px rgba(0,0,0,0.3)" }}>
        {page.about}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%" }}>
        {page.blocks.map((b) =>
          b.type === "social" ? (
            <div key={b.id} style={{ padding: "6px 0 2px" }}>
              <SocialRow platforms={b.platforms} />
            </div>
          ) : (
            <div key={b.id} style={{ background: "rgba(255,255,255,0.18)", backdropFilter: "blur(2px)", borderRadius: 10, padding: "10px 12px", ...sans, fontSize: 11, color: "#fff", textAlign: "center" }}>
              {b.label}
            </div>
          )
        )}
        {page.quizEnabled && (
          <div style={{ background: "#fff", borderRadius: 10, padding: "10px 12px", ...sans, fontSize: 11, color: c.boss, textAlign: "center", fontWeight: 700, marginTop: 4 }}>
            ✦ Não sabes por onde começar?
          </div>
        )}
      </div>
    </div>
  );
}

function LinkNaBioModule({ session }) {
  const pageQuery = useLinkPage(session, true);
  if (pageQuery.isLoading) {
    return <div className="bb-page" style={{ padding: "8px 40px 60px", ...sans, fontSize: 13, color: c.mist }}>A carregar…</div>;
  }
  if (pageQuery.error) {
    return <div className="bb-page" style={{ padding: "8px 40px 60px", ...sans, fontSize: 13, color: c.rose }}>{pageQuery.error.message}</div>;
  }
  return <LinkNaBioEditor initialPage={pageQuery.data} />;
}

function LinkNaBioEditor({ initialPage }) {
  const [page, setPage] = useState(initialPage);
  const [addingBlock, setAddingBlock] = useState(false);
  const [bgTab, setBgTab] = useState(page.bg.type);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const saveLinkPage = useSaveLinkPage();

  const updateBg = (patch) => setPage((p) => ({ ...p, bg: { ...p.bg, ...patch } }));
  const updateOverlay = (patch) => setPage((p) => ({ ...p, bg: { ...p.bg, overlay: { ...p.bg.overlay, ...patch } } }));

  const save = async () => {
    setError("");
    setSaved(false);
    try {
      const id = await saveLinkPage.mutateAsync(page);
      setPage((p) => ({ ...p, id }));
      setSaved(true);
    } catch (err) {
      setError(err.message || "Não foi possível guardar.");
    }
  };

  const onPhotoSelected = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const url = await uploadLinkMedia(page.agencyId, file, "bg");
      updateBg({ photoUrl: url });
    } catch (err) {
      setError(err.message || "Não foi possível carregar a foto.");
    } finally {
      setUploading(false);
    }
  };

  const onAvatarSelected = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const url = await uploadLinkMedia(page.agencyId, file, "avatar");
      setPage((p) => ({ ...p, avatarUrl: url }));
    } catch (err) {
      setError(err.message || "Não foi possível carregar a foto.");
    } finally {
      setUploading(false);
    }
  };

  const addBlock = (type) => {
    const defaults = { link: "Novo link", video: "Novo vídeo", product: "Novo produto — 0€", podcast: "Novo episódio", social: "Redes sociais" };
    const extra = type === "social" ? { platforms: ["instagram", "whatsapp"] } : {};
    setPage((p) => ({ ...p, blocks: [...p.blocks, { id: Date.now(), type, label: defaults[type], ...extra }] }));
    setAddingBlock(false);
  };
  const removeBlock = (id) => setPage((p) => ({ ...p, blocks: p.blocks.filter((b) => b.id !== id) }));
  const renameBlock = (id, label) => setPage((p) => ({ ...p, blocks: p.blocks.map((b) => (b.id === id ? { ...b, label } : b)) }));
  const toggleSocialPlatform = (id, key) => {
    setPage((p) => ({
      ...p,
      blocks: p.blocks.map((b) => {
        if (b.id !== id) return b;
        const has = b.platforms.includes(key);
        return { ...b, platforms: has ? b.platforms.filter((k) => k !== key) : [...b.platforms, key] };
      }),
    }));
  };
  const moveBlock = (id, dir) => {
    setPage((p) => {
      const idx = p.blocks.findIndex((b) => b.id === id);
      const swapWith = idx + dir;
      if (swapWith < 0 || swapWith >= p.blocks.length) return p;
      const blocks = [...p.blocks];
      [blocks[idx], blocks[swapWith]] = [blocks[swapWith], blocks[idx]];
      return { ...p, blocks };
    });
  };

  return (
    <div className="bb-page" style={{ padding: "8px 40px 60px", maxWidth: 1080 }}>
      <Eyebrow>Link na Bio</Eyebrow>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <h1 style={{ ...serif, fontSize: 30, fontWeight: 500, color: c.ink, margin: 0 }}>{page.ownerName}</h1>
        <button
          onClick={save}
          disabled={saveLinkPage.isPending}
          style={{ ...sans, fontSize: 12.5, fontWeight: 600, color: "#fff", background: c.boss, border: "none", borderRadius: 8, padding: "9px 16px", cursor: "pointer" }}
        >
          {saveLinkPage.isPending ? "A guardar…" : "Guardar"}
        </button>
      </div>
      <div style={{ ...sans, fontSize: 12, color: c.mist, marginBottom: 16 }}>
        big-boss.link/{page.slug}
      </div>
      {error && <div style={{ ...sans, fontSize: 12, color: c.rose, marginBottom: 16 }}>{error}</div>}
      {saved && <div style={{ ...sans, fontSize: 12, color: c.sage, marginBottom: 16 }}>Alterações guardadas.</div>}
      {uploading && <div style={{ ...sans, fontSize: 12, color: c.mist, marginBottom: 16 }}>A carregar imagem…</div>}

      <div style={{ display: "grid", gridTemplateColumns: "var(--bb-split, 300px 1fr)", gap: 28 }}>
        {/* pré-visualização em tempo real */}
        <div>
          <div style={{ position: "sticky", top: 20 }}>
            <LinkPagePreview page={page} />
          </div>
        </div>

        {/* configuração — tudo editável */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <ChartCard title="Foto de perfil" sub="Aparece no círculo do topo da página">
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <label
                style={{
                  width: 60, height: 60, borderRadius: 999, flexShrink: 0, cursor: "pointer",
                  background: page.avatarUrl ? `url(${page.avatarUrl}) center/cover` : c.paper,
                  border: `1.5px dashed ${page.avatarUrl ? "transparent" : c.line}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                <input type="file" accept="image/*" onChange={onAvatarSelected} style={{ display: "none" }} />
                {!page.avatarUrl && <Plus size={16} color={c.mist} />}
              </label>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <span style={{ ...sans, fontSize: 12, color: c.mist }}>
                  {page.avatarUrl ? "Carrega em cima para trocar a foto." : "Carrega uma foto para o avatar da página."}
                </span>
                {page.avatarUrl && (
                  <button
                    onClick={() => setPage((p) => ({ ...p, avatarBgRemoved: !p.avatarBgRemoved }))}
                    style={{
                      ...sans, display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, width: "fit-content",
                      color: page.avatarBgRemoved ? "#fff" : c.boss, background: page.avatarBgRemoved ? c.boss : c.bossSoft,
                      border: "none", borderRadius: 8, padding: "7px 12px", cursor: "pointer",
                    }}
                  >
                    <Sparkles size={13} /> {page.avatarBgRemoved ? "Fundo removido ✓" : "Remover fundo da foto"}
                  </button>
                )}
              </div>
            </div>
          </ChartCard>

          <ChartCard title="Foto e fundo" sub="Otimiza o visual da página">
            <div style={{ display: "flex", gap: 2, background: c.paper, borderRadius: 8, padding: 3, marginBottom: 14, width: "fit-content" }}>
              {[
                { key: "gradient", label: "Gradiente" },
                { key: "color", label: "Cor" },
                { key: "photo", label: "Foto" },
              ].map((t) => (
                <button
                  key={t.key}
                  onClick={() => { setBgTab(t.key); updateBg({ type: t.key }); }}
                  style={{
                    ...sans, fontSize: 11.5, fontWeight: 600, padding: "6px 12px", borderRadius: 6, border: "none", cursor: "pointer",
                    color: bgTab === t.key ? "#fff" : c.mist, background: bgTab === t.key ? c.boss : "transparent",
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {bgTab === "gradient" && (
              <div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
                  {GRADIENT_SWATCH_PAIRS.map(([from, to], i) => (
                    <button
                      key={i}
                      onClick={() => updateBg({ gradientFrom: from, gradientTo: to })}
                      style={{
                        width: 32, height: 32, borderRadius: 9, background: `linear-gradient(135deg, ${from}, ${to})`, cursor: "pointer",
                        border: page.bg.gradientFrom === from && page.bg.gradientTo === to ? `2px solid ${c.ink}` : "2px solid transparent",
                      }}
                    />
                  ))}
                </div>
                <div style={{ ...sans, fontSize: 11, color: c.mist, marginBottom: 8 }}>Ou escolhe as tuas próprias cores</div>
                <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", marginBottom: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <input type="color" value={page.bg.gradientFrom} onChange={(e) => updateBg({ gradientFrom: e.target.value })} style={{ width: 34, height: 30, border: `1px solid ${c.line}`, borderRadius: 6, cursor: "pointer", padding: 2 }} />
                    <span style={{ ...sans, fontSize: 11, color: c.mist }}>Início</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <input type="color" value={page.bg.gradientTo} onChange={(e) => updateBg({ gradientTo: e.target.value })} style={{ width: 34, height: 30, border: `1px solid ${c.line}`, borderRadius: 6, cursor: "pointer", padding: 2 }} />
                    <span style={{ ...sans, fontSize: 11, color: c.mist }}>Fim</span>
                  </div>
                </div>
                <div style={{ ...sans, fontSize: 11, color: c.mist, marginBottom: 6 }}>Ângulo — {page.bg.gradientAngle}°</div>
                <input
                  type="range" min="0" max="360" step="5"
                  value={page.bg.gradientAngle}
                  onChange={(e) => updateBg({ gradientAngle: parseInt(e.target.value) })}
                  style={{ width: "100%", accentColor: c.boss }}
                />
              </div>
            )}

            {bgTab === "color" && (
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <input
                  type="color"
                  value={page.bg.colorValue}
                  onChange={(e) => updateBg({ colorValue: e.target.value })}
                  style={{ width: 44, height: 36, border: `1px solid ${c.line}`, borderRadius: 8, cursor: "pointer", padding: 2 }}
                />
                <span style={{ ...sans, fontSize: 12, color: c.mist }}>Escolhe qualquer cor sólida de fundo</span>
              </div>
            )}

            {bgTab === "photo" && (
              <div>
                <label
                  style={{
                    height: page.bg.photoUrl ? 90 : 64, borderRadius: 12, border: `1.5px dashed ${c.line}`,
                    background: page.bg.photoUrl ? `url(${page.bg.photoUrl}) center/cover` : c.paper,
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 8, cursor: "pointer", position: "relative", overflow: "hidden",
                  }}
                >
                  <input type="file" accept="image/*" onChange={onPhotoSelected} style={{ display: "none" }} />
                  {!page.bg.photoUrl && (
                    <>
                      <Plus size={15} color={c.mist} />
                      <span style={{ ...sans, fontSize: 12, color: c.mist }}>Carregar foto de fundo</span>
                    </>
                  )}
                  {page.bg.photoUrl && (
                    <span style={{ ...sans, fontSize: 11, fontWeight: 600, color: "#fff", background: "rgba(0,0,0,0.45)", borderRadius: 999, padding: "4px 10px" }}>
                      Trocar foto
                    </span>
                  )}
                </label>

                {page.bg.photoUrl && (
                  <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${c.line}` }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                      <span style={{ ...sans, fontSize: 12, fontWeight: 600, color: c.ink }}>Gradiente por cima da foto</span>
                      <button
                        onClick={() => updateOverlay({ enabled: !page.bg.overlay.enabled })}
                        style={{
                          ...sans, fontSize: 11, fontWeight: 600, color: page.bg.overlay.enabled ? c.sage : c.mist,
                          background: page.bg.overlay.enabled ? "#E7F5EC" : c.paper, border: "none", borderRadius: 999, padding: "4px 10px", cursor: "pointer",
                        }}
                      >
                        {page.bg.overlay.enabled ? "Ativo" : "Inativo"}
                      </button>
                    </div>
                    {page.bg.overlay.enabled && (
                      <>
                        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                          {[
                            { key: "180deg", label: "De baixo" },
                            { key: "90deg", label: "Do lado" },
                            { key: "0deg", label: "De cima" },
                          ].map((d) => (
                            <button
                              key={d.key}
                              onClick={() => updateOverlay({ direction: d.key })}
                              style={{
                                ...sans, fontSize: 11, fontWeight: 600, padding: "6px 10px", borderRadius: 7, cursor: "pointer",
                                color: page.bg.overlay.direction === d.key ? "#fff" : c.mist,
                                background: page.bg.overlay.direction === d.key ? c.boss : c.paper,
                                border: "none",
                              }}
                            >
                              {d.label}
                            </button>
                          ))}
                        </div>
                        <div style={{ ...sans, fontSize: 11, color: c.mist, marginBottom: 6 }}>Intensidade — {page.bg.overlay.intensity}%</div>
                        <input
                          type="range" min="0" max="90" step="5"
                          value={page.bg.overlay.intensity}
                          onChange={(e) => updateOverlay({ intensity: parseInt(e.target.value) })}
                          style={{ width: "100%", accentColor: c.boss }}
                        />
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </ChartCard>

          <ChartCard title="Sobre a marca" sub="Texto de apresentação">
            <textarea
              value={page.about}
              onChange={(e) => setPage((p) => ({ ...p, about: e.target.value }))}
              rows={2}
              style={{ ...sans, width: "100%", fontSize: 13, border: `1px solid ${c.line}`, borderRadius: 8, padding: "9px 12px", outline: "none", color: c.ink, resize: "vertical" }}
            />
          </ChartCard>

          <ChartCard
            title="Blocos"
            sub="Estrutura da página, de cima a baixo"
            right={
              <button
                onClick={() => setAddingBlock((v) => !v)}
                style={{
                  ...sans, display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, color: "#fff",
                  background: c.boss, border: "none", borderRadius: 7, padding: "7px 12px", cursor: "pointer",
                }}
              >
                <Plus size={13} /> Novo bloco
              </button>
            }
          >
            {addingBlock && (
              <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
                {BLOCK_TYPES.map((bt) => {
                  const Icon = bt.icon;
                  return (
                    <button
                      key={bt.type}
                      onClick={() => addBlock(bt.type)}
                      style={{
                        ...sans, display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: c.ink,
                        background: c.paper, border: `1px solid ${c.line}`, borderRadius: 8, padding: "7px 11px", cursor: "pointer",
                      }}
                    >
                      <Icon size={13} color={c.boss} /> {bt.label}
                    </button>
                  );
                })}
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {page.blocks.map((b, i) => (
                <div key={b.id} style={{ background: c.paper, borderRadius: 8, padding: "7px 8px 7px 12px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input
                      value={b.label}
                      onChange={(e) => renameBlock(b.id, e.target.value)}
                      style={{ ...sans, flex: 1, fontSize: 12.5, color: c.ink, background: "none", border: "none", outline: "none" }}
                    />
                    <span style={{ ...sans, fontSize: 9.5, fontWeight: 700, color: c.mist, textTransform: "uppercase", flexShrink: 0 }}>{b.type}</span>
                    <button onClick={() => moveBlock(b.id, -1)} disabled={i === 0} style={{ background: "none", border: "none", cursor: i === 0 ? "default" : "pointer", color: i === 0 ? c.line : c.mist, padding: 2 }}>
                      <ChevronUp size={13} />
                    </button>
                    <button onClick={() => moveBlock(b.id, 1)} disabled={i === page.blocks.length - 1} style={{ background: "none", border: "none", cursor: i === page.blocks.length - 1 ? "default" : "pointer", color: i === page.blocks.length - 1 ? c.line : c.mist, padding: 2 }}>
                      <ChevronDown size={13} />
                    </button>
                    <button onClick={() => removeBlock(b.id)} style={{ background: "none", border: "none", cursor: "pointer", color: c.rose, padding: 2 }}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                  {b.type === "social" && (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8, paddingLeft: 2 }}>
                      {SOCIAL_PLATFORMS.map((sp) => {
                        const Icon = sp.icon;
                        const active = b.platforms.includes(sp.key);
                        return (
                          <button
                            key={sp.key}
                            onClick={() => toggleSocialPlatform(b.id, sp.key)}
                            style={{
                              display: "flex", alignItems: "center", gap: 5, ...sans, fontSize: 11, fontWeight: 600,
                              color: active ? "#fff" : c.mist, background: active ? c.boss : "#fff",
                              border: `1px solid ${active ? c.boss : c.line}`, borderRadius: 999, padding: "4px 10px", cursor: "pointer",
                            }}
                          >
                            <Icon size={11} /> {sp.label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
              {page.blocks.length === 0 && (
                <div style={{ ...sans, fontSize: 12, color: c.mistLight, textAlign: "center", padding: "16px 0" }}>
                  Ainda sem blocos — adiciona o primeiro acima.
                </div>
              )}
            </div>
          </ChartCard>

          <ChartCard
            title="Quiz de recomendação"
            sub="Até 5 perguntas → produto ou WhatsApp"
            right={
              <button
                onClick={() => setPage((p) => ({ ...p, quizEnabled: !p.quizEnabled }))}
                style={{
                  ...sans, fontSize: 11.5, fontWeight: 600, color: page.quizEnabled ? c.sage : c.mist,
                  background: page.quizEnabled ? "#E7F5EC" : c.paper, border: "none", borderRadius: 999, padding: "4px 10px", cursor: "pointer",
                }}
              >
                {page.quizEnabled ? "Ativo" : "Inativo"}
              </button>
            }
          >
            <div style={{ ...sans, fontSize: 12.5, color: c.mist, lineHeight: 1.6 }}>
              Cada pergunta tem 2-4 opções; a combinação de respostas determina o produto (ou o WhatsApp) para onde a pessoa é levada no fim.
            </div>
          </ChartCard>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
   CALCULADORA DE PRECIFICAÇÃO — custos livres, sem categorias fixas
--------------------------------------------------------- */
function calcTotals(product) {
  const lineTotal = product.costLines.reduce((sum, l) => sum + (parseFloat(l.amount) || 0), 0);
  const margin = (parseFloat(product.marginPct) || 0) / 100;
  const exclusivity = parseFloat(product.exclusivity) || 1;
  let baseCost = lineTotal;
  let unitLabel = "por unidade";

  if (product.type === "servico_hora") {
    const hours = parseFloat(product.hoursPerSession) || 0;
    const rate = parseFloat(product.hourlyRate) || 0;
    baseCost = lineTotal + hours * rate;
    unitLabel = "por sessão";
  } else if (product.type === "produto_fisico") {
    const qty = parseFloat(product.quantity) || 1;
    baseCost = lineTotal / qty;
    unitLabel = "por unidade";
  } else if (product.type === "pacote_projeto") {
    const rate = parseFloat(product.hourlyRate) || 0;
    const deliverablesCost = (product.deliverables || []).reduce((sum, d) => sum + (parseFloat(d.hours) || 0) * rate, 0);
    baseCost = lineTotal + deliverablesCost;
    unitLabel = "por projeto";
  } else if (product.type === "recorrente") {
    const setup = parseFloat(product.setupCost) || 0;
    const months = parseFloat(product.amortizeMonths) || 1;
    baseCost = lineTotal + setup / months;
    unitLabel = "por mês";
  }

  const suggested = baseCost * (1 + margin) * exclusivity;
  const currentPrice = parseFloat(product.currentPrice) || null;
  const realMarginPct = currentPrice ? ((currentPrice - baseCost) / currentPrice) * 100 : null;
  return { costPerUnit: baseCost, suggested, currentPrice, realMarginPct, unitLabel };
}

function TypeSpecificFields({ product, onChange }) {
  if (product.type === "servico_hora") {
    return (
      <ChartCard title="Tempo de trabalho" sub="Entra automaticamente no custo total">
        <div style={{ display: "grid", gridTemplateColumns: "var(--bb-grid-2, 1fr 1fr)", gap: 12 }}>
          <div>
            <div style={{ ...sans, fontSize: 11, color: c.mist, marginBottom: 5 }}>Duração da sessão (horas)</div>
            <input type="number" step="0.1" value={product.hoursPerSession} onChange={(e) => onChange({ ...product, hoursPerSession: e.target.value })}
              style={{ ...sans, width: "100%", fontSize: 15, border: `1px solid ${c.line}`, borderRadius: 8, padding: "8px 12px", outline: "none", color: c.ink }} />
          </div>
          <div>
            <div style={{ ...sans, fontSize: 11, color: c.mist, marginBottom: 5 }}>Valor da tua hora (€)</div>
            <input type="number" value={product.hourlyRate} onChange={(e) => onChange({ ...product, hourlyRate: e.target.value })}
              style={{ ...sans, width: "100%", fontSize: 15, border: `1px solid ${c.line}`, borderRadius: 8, padding: "8px 12px", outline: "none", color: c.ink }} />
          </div>
        </div>
      </ChartCard>
    );
  }
  if (product.type === "produto_fisico") {
    return (
      <ChartCard title="Lote" sub="Quantas unidades produziste com estes custos — reparte o custo por unidade">
        <input type="number" value={product.quantity} onChange={(e) => onChange({ ...product, quantity: e.target.value })}
          style={{ ...sans, width: 160, fontSize: 16, border: `1px solid ${c.line}`, borderRadius: 8, padding: "8px 12px", outline: "none", color: c.ink }} />
      </ChartCard>
    );
  }
  if (product.type === "pacote_projeto") {
    const addDeliverable = () => onChange({ ...product, deliverables: [...(product.deliverables || []), { id: Date.now(), label: "", hours: "" }] });
    const updateDeliverable = (id, field, value) => onChange({ ...product, deliverables: product.deliverables.map((d) => (d.id === id ? { ...d, [field]: value } : d)) });
    const removeDeliverable = (id) => onChange({ ...product, deliverables: product.deliverables.filter((d) => d.id !== id) });
    return (
      <ChartCard
        title="Entregáveis do projeto"
        sub="Cada um consome horas, à tua taxa horária definida abaixo"
        right={
          <button onClick={addDeliverable} style={{ ...sans, display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, color: "#fff", background: c.boss, border: "none", borderRadius: 7, padding: "7px 12px", cursor: "pointer" }}>
            <Plus size={13} /> Entregável
          </button>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
          {(product.deliverables || []).map((d) => (
            <div key={d.id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input value={d.label} onChange={(e) => updateDeliverable(d.id, "label", e.target.value)} placeholder="Ex: Logótipo"
                style={{ ...sans, flex: 1, fontSize: 12.5, border: `1px solid ${c.line}`, borderRadius: 8, padding: "8px 12px", outline: "none", color: c.ink }} />
              <input type="number" value={d.hours} onChange={(e) => updateDeliverable(d.id, "hours", e.target.value)} placeholder="Horas"
                style={{ ...sans, width: 90, fontSize: 12.5, border: `1px solid ${c.line}`, borderRadius: 8, padding: "8px 12px", outline: "none", color: c.ink }} />
              <button onClick={() => removeDeliverable(d.id)} style={{ background: "none", border: "none", cursor: "pointer", color: c.rose, flexShrink: 0 }}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          {(!product.deliverables || product.deliverables.length === 0) && (
            <div style={{ ...sans, fontSize: 12, color: c.mistLight, textAlign: "center", padding: "6px 0" }}>Sem entregáveis ainda.</div>
          )}
        </div>
        <div style={{ ...sans, fontSize: 11, color: c.mist, marginBottom: 5 }}>A tua taxa horária (€)</div>
        <input type="number" value={product.hourlyRate} onChange={(e) => onChange({ ...product, hourlyRate: e.target.value })}
          style={{ ...sans, width: 160, fontSize: 15, border: `1px solid ${c.line}`, borderRadius: 8, padding: "8px 12px", outline: "none", color: c.ink }} />
      </ChartCard>
    );
  }
  if (product.type === "recorrente") {
    return (
      <ChartCard title="Amortização do arranque" sub="Custo único de configuração, distribuído pelos primeiros meses">
        <div style={{ display: "grid", gridTemplateColumns: "var(--bb-grid-2, 1fr 1fr)", gap: 12 }}>
          <div>
            <div style={{ ...sans, fontSize: 11, color: c.mist, marginBottom: 5 }}>Custo de configuração inicial (€)</div>
            <input type="number" value={product.setupCost} onChange={(e) => onChange({ ...product, setupCost: e.target.value })}
              style={{ ...sans, width: "100%", fontSize: 15, border: `1px solid ${c.line}`, borderRadius: 8, padding: "8px 12px", outline: "none", color: c.ink }} />
          </div>
          <div>
            <div style={{ ...sans, fontSize: 11, color: c.mist, marginBottom: 5 }}>Meses para amortizar</div>
            <input type="number" value={product.amortizeMonths} onChange={(e) => onChange({ ...product, amortizeMonths: e.target.value })}
              style={{ ...sans, width: "100%", fontSize: 15, border: `1px solid ${c.line}`, borderRadius: 8, padding: "8px 12px", outline: "none", color: c.ink }} />
          </div>
        </div>
      </ChartCard>
    );
  }
  return null;
}

function ProductPricingForm({ product, onChange, onDelete }) {
  const totals = calcTotals(product);
  const typeInfo = PRICING_TYPES.find((t) => t.key === product.type);
  const updateLine = (id, field, value) =>
    onChange({ ...product, costLines: product.costLines.map((l) => (l.id === id ? { ...l, [field]: value } : l)) });
  const addLine = () =>
    onChange({ ...product, costLines: [...product.costLines, { id: Date.now(), label: "", amount: "" }] });
  const removeLine = (id) => onChange({ ...product, costLines: product.costLines.filter((l) => l.id !== id) });

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6, flexWrap: "wrap" }}>
        <input
          value={product.name}
          onChange={(e) => onChange({ ...product, name: e.target.value })}
          placeholder="Nome do produto ou serviço"
          style={{ ...serif, flex: 1, fontSize: 22, color: c.ink, border: "none", outline: "none", background: "none", padding: "4px 0", minWidth: 200 }}
        />
        <button onClick={onDelete} style={{ ...sans, display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: c.rose, background: "none", border: `1px solid ${c.line}`, borderRadius: 8, padding: "7px 11px", cursor: "pointer", flexShrink: 0 }}>
          <Trash2 size={13} /> Eliminar
        </button>
      </div>
      {typeInfo && (
        <div style={{ ...sans, fontSize: 11.5, fontWeight: 600, color: c.boss, background: c.bossSoft, borderRadius: 999, padding: "4px 10px", display: "inline-block", marginBottom: 20 }}>
          {typeInfo.label}
        </div>
      )}

      <div style={{ marginBottom: 14 }}>
        <TypeSpecificFields product={product} onChange={onChange} />
      </div>

      <ChartCard
        title="Outros custos"
        sub="Materiais, ferramentas, extras — adiciona todos os que fizerem sentido, sem limite"
        right={
          <button
            onClick={addLine}
            style={{ ...sans, display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, color: "#fff", background: c.boss, border: "none", borderRadius: 7, padding: "7px 12px", cursor: "pointer" }}
          >
            <Plus size={13} /> Adicionar custo
          </button>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {product.costLines.map((l) => (
            <div key={l.id} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <input
                value={l.label}
                onChange={(e) => updateLine(l.id, "label", e.target.value)}
                placeholder="Ex: tecido, embalagem, consumível..."
                style={{ ...sans, flex: 1, minWidth: 160, fontSize: 12.5, border: `1px solid ${c.line}`, borderRadius: 8, padding: "8px 12px", outline: "none", color: c.ink }}
              />
              <input
                type="number"
                value={l.amount}
                onChange={(e) => updateLine(l.id, "amount", e.target.value)}
                placeholder="0.00€"
                style={{ ...sans, width: 100, fontSize: 12.5, border: `1px solid ${c.line}`, borderRadius: 8, padding: "8px 12px", outline: "none", color: c.ink }}
              />
              <button onClick={() => removeLine(l.id)} style={{ background: "none", border: "none", cursor: "pointer", color: c.rose, flexShrink: 0 }}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          {product.costLines.length === 0 && (
            <div style={{ ...sans, fontSize: 12, color: c.mistLight, textAlign: "center", padding: "10px 0" }}>
              Sem custos adicionais — adiciona se fizer sentido.
            </div>
          )}
        </div>
      </ChartCard>

      <div style={{ display: "grid", gridTemplateColumns: "var(--bb-grid-2, 1fr 1fr)", gap: 12, marginTop: 14 }}>
        <ChartCard title="Margem desejada" sub="Percentagem sobre o custo">
          <input
            type="number"
            value={product.marginPct}
            onChange={(e) => onChange({ ...product, marginPct: e.target.value })}
            style={{ ...sans, width: "100%", fontSize: 16, border: `1px solid ${c.line}`, borderRadius: 8, padding: "8px 12px", outline: "none", color: c.ink }}
          />
        </ChartCard>
        <ChartCard title="Fator de exclusividade" sub={`${parseFloat(product.exclusivity || 1).toFixed(1)}× — arrasta para ajustar`}>
          <input
            type="range"
            min="0.5"
            max="2.5"
            step="0.1"
            value={product.exclusivity}
            onChange={(e) => onChange({ ...product, exclusivity: e.target.value })}
            style={{ width: "100%", accentColor: c.boss, marginTop: 10 }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", ...sans, fontSize: 10, color: c.mistLight, marginTop: 4 }}>
            <span>Padrão</span>
            <span>Premium</span>
          </div>
        </ChartCard>
      </div>

      <div style={{ marginTop: 14 }}>
        <ChartCard title="Preço que praticas atualmente" sub="Opcional — para comparação com o sugerido">
          <input
            type="number"
            value={product.currentPrice}
            onChange={(e) => onChange({ ...product, currentPrice: e.target.value })}
            placeholder="0.00€"
            style={{ ...sans, width: 160, fontSize: 14, border: `1px solid ${c.line}`, borderRadius: 8, padding: "8px 12px", outline: "none", color: c.ink }}
          />
        </ChartCard>
      </div>

      <div style={{ marginTop: 14 }}>
        <ChartCard title="Resultado" sub={`Calculado a partir de todos os custos acima — ${totals.unitLabel}`}>
          <div style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>
            <div>
              <div style={{ ...serif, fontSize: 24, color: c.ink }}>{totals.costPerUnit.toFixed(2)}€</div>
              <div style={{ ...sans, fontSize: 11, color: c.mist, marginTop: 2 }}>Custo total ({totals.unitLabel})</div>
            </div>
            <div>
              <div style={{ ...serif, fontSize: 24, color: c.boss }}>{totals.suggested.toFixed(2)}€</div>
              <div style={{ ...sans, fontSize: 11, color: c.mist, marginTop: 2 }}>Preço sugerido</div>
            </div>
            <div>
              <div style={{ ...serif, fontSize: 24, color: c.sage }}>{(totals.suggested - totals.costPerUnit).toFixed(2)}€</div>
              <div style={{ ...sans, fontSize: 11, color: c.mist, marginTop: 2 }}>Lucro estimado</div>
            </div>
            {totals.realMarginPct !== null && (
              <div>
                <div style={{ ...serif, fontSize: 24, color: totals.realMarginPct >= 0 ? c.sage : c.rose }}>
                  {totals.realMarginPct.toFixed(0)}%
                </div>
                <div style={{ ...sans, fontSize: 11, color: c.mist, marginTop: 2 }}>Margem real ao preço atual</div>
              </div>
            )}
          </div>
        </ChartCard>
      </div>
    </div>
  );
}

function ProductPricingPanel({ initialProduct, onBack }) {
  const [product, onChange] = useState(initialProduct);
  const saveProduct = useSaveProduct();
  const deleteProduct = useDeleteProduct();

  return (
    <div className="bb-page" style={{ padding: "8px 40px 60px", maxWidth: 900 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <button
          onClick={onBack}
          style={{ ...sans, display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: c.mist, background: "none", border: "none", cursor: "pointer" }}
        >
          <ArrowLeft size={14} /> Calculadora de Precificação
        </button>
        <button
          onClick={() => saveProduct.mutate(product)}
          disabled={saveProduct.isPending}
          style={{ ...sans, fontSize: 12.5, fontWeight: 600, color: "#fff", background: c.boss, border: "none", borderRadius: 8, padding: "8px 16px", cursor: "pointer" }}
        >
          {saveProduct.isPending ? "A guardar…" : "Guardar"}
        </button>
      </div>
      <ProductPricingForm product={product} onChange={onChange} onDelete={() => deleteProduct.mutate(product.id, { onSuccess: onBack })} />
    </div>
  );
}

function CalculadoraModule({ session }) {
  const [openId, setOpenId] = useState(null);
  const [pickingType, setPickingType] = useState(false);
  const productsQuery = useProducts(session, true);
  const addProduct = useAddProduct(session);
  const deleteProduct = useDeleteProduct();
  const products = productsQuery.data || [];
  const product = products.find((p) => p.id === openId);

  const createProduct = async (type) => {
    const base = { type, name: "Novo produto ou serviço", marginPct: 35, exclusivity: 1, currentPrice: "", costLines: [] };
    const extra =
      type === "servico_hora" ? { hoursPerSession: "1", hourlyRate: "10" } :
      type === "produto_fisico" ? { quantity: 1 } :
      type === "pacote_projeto" ? { hourlyRate: "20", deliverables: [] } :
      { setupCost: "0", amortizeMonths: "1" };
    const newProduct = await addProduct.mutateAsync({ ...base, ...extra });
    setPickingType(false);
    setOpenId(newProduct.id);
  };

  if (product) {
    return <ProductPricingPanel initialProduct={product} onBack={() => setOpenId(null)} />;
  }

  return (
    <div className="bb-page" style={{ padding: "8px 40px 60px", maxWidth: 1040 }}>
      <Eyebrow>Calculadora de Precificação</Eyebrow>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 10 }}>
        <h1 style={{ ...serif, fontSize: 30, fontWeight: 500, color: c.ink, margin: 0 }}>Produtos e serviços</h1>
        <button
          onClick={() => setPickingType(true)}
          style={{
            ...sans, display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, color: "#fff",
            background: c.boss, border: "none", borderRadius: 8, padding: "9px 16px", cursor: "pointer",
          }}
        >
          <Plus size={14} /> Novo produto/serviço
        </button>
      </div>
      <div style={{ ...sans, fontSize: 12.5, color: c.mist, marginBottom: 20, maxWidth: 600, lineHeight: 1.6 }}>
        Cada tipo tem a sua própria lógica de custo — uma consulta não se calcula como um produto físico, nem como um projeto fechado. Escolhe o tipo certo para cada coisa que vendas.
      </div>
      {productsQuery.isLoading && <div style={{ ...sans, fontSize: 13, color: c.mist, marginBottom: 20 }}>A carregar…</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {products.map((p) => {
          const totals = calcTotals(p);
          const typeInfo = PRICING_TYPES.find((t) => t.key === p.type);
          const TypeIcon = typeInfo ? typeInfo.icon : Calculator;
          return (
            <div
              key={p.id}
              onClick={() => setOpenId(p.id)}
              style={{ display: "flex", alignItems: "center", gap: 14, background: "#fff", border: `1px solid ${c.line}`, borderRadius: 12, padding: "14px 18px", cursor: "pointer", flexWrap: "wrap" }}
            >
              <div style={{ width: 34, height: 34, borderRadius: 9, background: c.bossSoft, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <TypeIcon size={16} color={c.boss} strokeWidth={1.8} />
              </div>
              <div style={{ flex: 1, minWidth: 140 }}>
                <div style={{ ...serif, fontSize: 15, color: c.ink, fontWeight: 500 }}>{p.name}</div>
                <div style={{ ...sans, fontSize: 11.5, color: c.mist, marginTop: 2 }}>
                  {typeInfo ? typeInfo.label : "—"} · {totals.unitLabel}
                </div>
              </div>
              <div style={{ ...serif, fontSize: 17, color: c.boss }}>{totals.suggested.toFixed(2)}€</div>
              <button
                onClick={(e) => { e.stopPropagation(); deleteProduct.mutate(p.id); }}
                style={{ background: "none", border: "none", cursor: "pointer", color: c.mist, padding: 4 }}
              >
                <Trash2 size={15} />
              </button>
            </div>
          );
        })}
        {!productsQuery.isLoading && products.length === 0 && (
          <div style={{ ...sans, fontSize: 13, color: c.mistLight, textAlign: "center", padding: "40px 0" }}>
            Ainda sem produtos — cria o primeiro para veres o custo real.
          </div>
        )}
      </div>

      {pickingType && (
        <div onClick={() => setPickingType(false)} style={{ position: "fixed", inset: 0, background: "rgba(23,21,31,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 20, overflowY: "auto" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, padding: 26, maxWidth: 520, width: "100%", maxHeight: "85vh", overflowY: "auto", position: "relative", margin: "auto" }}>
            <button
              onClick={() => setPickingType(false)}
              style={{ position: "absolute", top: 14, right: 14, background: c.paper, border: "none", borderRadius: 999, width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: c.mist }}
            >
              <XCircle size={16} />
            </button>
            <div style={{ ...serif, fontSize: 18, color: c.ink, marginBottom: 4, paddingRight: 30 }}>O que vais precificar?</div>
            <div style={{ ...sans, fontSize: 12, color: c.mist, marginBottom: 18 }}>Escolhe o tipo — muda os campos e a fórmula de cálculo.</div>
            <div style={{ display: "grid", gridTemplateColumns: "var(--bb-grid-2, 1fr 1fr)", gap: 10 }}>
              {PRICING_TYPES.map((t) => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.key}
                    onClick={() => createProduct(t.key)}
                    style={{ textAlign: "left", background: c.paper, border: `1px solid ${c.line}`, borderRadius: 12, padding: 16, cursor: "pointer" }}
                  >
                    <Icon size={17} color={c.boss} strokeWidth={1.8} />
                    <div style={{ ...serif, fontSize: 14, color: c.ink, marginTop: 10, marginBottom: 4 }}>{t.label}</div>
                    <div style={{ ...sans, fontSize: 11, color: c.mist, lineHeight: 1.5 }}>{t.desc}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------
   EQUIPA
--------------------------------------------------------- */
function TeamMemberRow({ member, canManage, onRename, onRemove }) {
  const [name, setName] = useState(member.name);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, background: "#fff", border: `1px solid ${c.line}`, borderRadius: 12, padding: "14px 18px" }}>
      <div style={{ width: 38, height: 38, borderRadius: 999, background: c.bossSoft, color: c.boss, display: "flex", alignItems: "center", justifyContent: "center", ...serif, fontSize: 15, flexShrink: 0 }}>
        {member.initial}
      </div>
      <div style={{ flex: 1 }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() && name !== member.name && onRename(name.trim())}
          readOnly={!canManage}
          style={{ ...serif, fontSize: 14.5, color: c.ink, border: "none", outline: "none", background: "none", width: "100%" }}
        />
        <div style={{ ...sans, fontSize: 11.5, color: c.mist, marginTop: 2 }}>{member.scope} · {member.email}</div>
      </div>
      <span style={{ ...sans, fontSize: 11, fontWeight: 600, color: c.boss, background: c.bossSoft, borderRadius: 999, padding: "4px 10px" }}>
        {member.role}
      </span>
      {canManage && (
        <button onClick={onRemove} style={{ background: "none", border: "none", cursor: "pointer", color: c.mist, flexShrink: 0 }}>
          <Trash2 size={15} />
        </button>
      )}
    </div>
  );
}

function EquipaModule({ session }) {
  const [showInvite, setShowInvite] = useState(false);
  const membersQuery = useTeamMembers(true);
  const renameMember = useRenameMember();
  const removeMember = useRemoveMember();
  const members = membersQuery.data || [];
  const canManage = session.role === "admin_geral" || session.role === "agencia_admin";

  return (
    <div className="bb-page" style={{ padding: "8px 40px 60px", maxWidth: 1040 }}>
      <Eyebrow>Equipa</Eyebrow>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <h1 style={{ ...serif, fontSize: 30, fontWeight: 500, color: c.ink, margin: 0 }}>Membros e acessos</h1>
        {canManage && (
          <button
            onClick={() => setShowInvite((v) => !v)}
            style={{
              ...sans, display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, color: "#fff",
              background: c.boss, border: "none", borderRadius: 8, padding: "9px 16px", cursor: "pointer",
            }}
          >
            <Plus size={14} /> Convidar pessoa
          </button>
        )}
      </div>

      {showInvite && (
        <div style={{ background: c.bossSoft, borderRadius: 12, padding: "16px 18px", marginBottom: 20, ...sans, fontSize: 12.5, color: c.ink, lineHeight: 1.7 }}>
          Por segurança, novas contas não podem ser criadas a partir daqui. Pede a quem administra o Supabase para:
          <br />1. Ir a <strong>Authentication → Users → Add user</strong> e criar o login da pessoa.
          <br />2. Voltar aqui — a pessoa aparece nesta lista assim que tiver uma linha na tabela <code>profiles</code> associada (README, secção 4).
        </div>
      )}

      {membersQuery.isLoading && <div style={{ ...sans, fontSize: 13, color: c.mist }}>A carregar…</div>}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {members.map((m) => (
          <TeamMemberRow
            key={m.id}
            member={m}
            canManage={canManage}
            onRename={(name) => renameMember.mutate({ id: m.id, name })}
            onRemove={() => removeMember.mutate(m.id)}
          />
        ))}
        {!membersQuery.isLoading && members.length === 0 && (
          <div style={{ ...sans, fontSize: 13, color: c.mistLight, textAlign: "center", padding: "40px 0" }}>
            Sem membros visíveis para a tua conta.
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
   DEFINIÇÕES
--------------------------------------------------------- */
function useAgencyBranding(session, enabled) {
  return useQuery({
    queryKey: ["agency_branding", session?.agency_id, session?.id],
    enabled,
    queryFn: async () => {
      const agencyId = await resolveDefaultAgencyId(session);
      const { data, error } = await supabase.from("agencies").select("id, primary_color").eq("id", agencyId).single();
      if (error) throw error;
      return { agencyId: data.id, primaryColor: data.primary_color || c.boss };
    },
  });
}

function useSaveAgencyColor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ agencyId, color }) => {
      const { error } = await supabase.from("agencies").update({ primary_color: color }).eq("id", agencyId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["agency_branding"] }),
  });
}

function DefinicoesModule({ session }) {
  const canManageAgency = session.role === "admin_geral" || session.role === "agencia_admin";
  const brandingQuery = useAgencyBranding(session, canManageAgency);
  const saveColor = useSaveAgencyColor();
  const [brandColor, setBrandColor] = useState(null);
  const colorValue = brandColor !== null ? brandColor : (brandingQuery.data?.primaryColor || c.boss);
  const presets = [c.boss, "#2F9E63", "#C9821F", "#3B5FC2", "#D3455B", "#1C1526"];

  const [name, setName] = useState(session.name || "");
  const [email, setEmail] = useState(session.email || "");
  const [password, setPassword] = useState("");
  const [accountError, setAccountError] = useState("");
  const [accountSaved, setAccountSaved] = useState(false);
  const [savingAccount, setSavingAccount] = useState(false);

  const saveBranding = () => {
    if (brandingQuery.data) saveColor.mutate({ agencyId: brandingQuery.data.agencyId, color: colorValue });
  };

  const saveAccount = async () => {
    setAccountError("");
    setAccountSaved(false);
    setSavingAccount(true);
    try {
      if (name !== session.name) {
        const { error } = await supabase.from("profiles").update({ name }).eq("id", session.id);
        if (error) throw error;
      }
      if (email !== session.email) {
        const { error } = await supabase.auth.updateUser({ email });
        if (error) throw error;
      }
      if (password.trim()) {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        setPassword("");
      }
      setAccountSaved(true);
    } catch (err) {
      setAccountError(err.message || "Não foi possível guardar.");
    } finally {
      setSavingAccount(false);
    }
  };

  return (
    <div className="bb-page" style={{ padding: "8px 40px 60px", maxWidth: 760 }}>
      <Eyebrow>Definições</Eyebrow>
      <h1 style={{ ...serif, fontSize: 30, fontWeight: 500, color: c.ink, margin: "0 0 24px" }}>Conta e branding</h1>

      {canManageAgency && (
        <div style={{ marginBottom: 14 }}>
          <ChartCard
            title="Branding da agência"
            sub="Cor principal usada em relatórios, propostas e portfólio"
            right={
              <button
                onClick={saveBranding}
                disabled={saveColor.isPending}
                style={{ ...sans, fontSize: 12, fontWeight: 600, color: "#fff", background: c.boss, border: "none", borderRadius: 7, padding: "7px 12px", cursor: "pointer" }}
              >
                {saveColor.isPending ? "A guardar…" : "Guardar"}
              </button>
            }
          >
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16, flexWrap: "wrap" }}>
              {presets.map((hex) => (
                <button
                  key={hex}
                  onClick={() => setBrandColor(hex)}
                  style={{ width: 32, height: 32, borderRadius: 999, background: hex, border: hex === colorValue ? `2px solid ${c.ink}` : "1px solid transparent", cursor: "pointer" }}
                />
              ))}
              <div style={{ width: 1, height: 26, background: c.line }} />
              <input
                type="color"
                value={colorValue}
                onChange={(e) => setBrandColor(e.target.value)}
                style={{ width: 40, height: 32, border: `1px solid ${c.line}`, borderRadius: 8, cursor: "pointer", padding: 2 }}
              />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 22, height: 22, borderRadius: 6, background: colorValue, flexShrink: 0 }} />
              <span style={{ ...sans, fontSize: 12, color: c.mist }}>Cor atual: {colorValue} — qualquer cor é válida, não só as sugeridas acima.</span>
            </div>
          </ChartCard>
        </div>
      )}

      <ChartCard
        title="Conta"
        sub="Dados de acesso"
        right={
          <button
            onClick={saveAccount}
            disabled={savingAccount}
            style={{ ...sans, fontSize: 12, fontWeight: 600, color: "#fff", background: c.boss, border: "none", borderRadius: 7, padding: "7px 12px", cursor: "pointer" }}
          >
            {savingAccount ? "A guardar…" : "Guardar"}
          </button>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 380 }}>
          <div>
            <div style={{ ...sans, fontSize: 11, color: c.mist, marginBottom: 5 }}>Nome</div>
            <input value={name} onChange={(e) => setName(e.target.value)} style={{ ...sans, width: "100%", fontSize: 13, border: `1px solid ${c.line}`, borderRadius: 8, padding: "9px 12px", outline: "none", color: c.ink }} />
          </div>
          <div>
            <div style={{ ...sans, fontSize: 11, color: c.mist, marginBottom: 5 }}>Email</div>
            <input value={email} onChange={(e) => setEmail(e.target.value)} style={{ ...sans, width: "100%", fontSize: 13, border: `1px solid ${c.line}`, borderRadius: 8, padding: "9px 12px", outline: "none", color: c.ink }} />
          </div>
          <div>
            <div style={{ ...sans, fontSize: 11, color: c.mist, marginBottom: 5 }}>Nova palavra-passe (opcional)</div>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Deixa em branco para não alterar" style={{ ...sans, width: "100%", fontSize: 13, border: `1px solid ${c.line}`, borderRadius: 8, padding: "9px 12px", outline: "none", color: c.ink }} />
          </div>
          {accountError && <div style={{ ...sans, fontSize: 12, color: c.rose }}>{accountError}</div>}
          {accountSaved && <div style={{ ...sans, fontSize: 12, color: c.sage }}>Alterações guardadas.</div>}
        </div>
      </ChartCard>
    </div>
  );
}

/* ---------------------------------------------------------
   CRONOGRAMA DE CONTEÚDOS — planeamento (distinto de Conteúdos/aprovação)
--------------------------------------------------------- */
function ContentIdeaRow({ idea, onChange, onRemove, canManage }) {
  return (
    <div style={{ background: c.paper, borderRadius: 10, padding: "10px 12px", marginBottom: 8 }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <select
          value={idea.type}
          onChange={(e) => onChange({ ...idea, type: e.target.value })}
          disabled={!canManage}
          style={{ ...sans, fontSize: 11.5, fontWeight: 600, color: c.boss, background: c.bossSoft, border: "none", borderRadius: 6, padding: "5px 8px", cursor: canManage ? "pointer" : "default" }}
        >
          {CONTENT_IDEA_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <div style={{ flex: 1 }} />
        {canManage && (
          <button onClick={onRemove} style={{ background: "none", border: "none", cursor: "pointer", color: c.rose, padding: 0 }}>
            <Trash2 size={13} />
          </button>
        )}
      </div>
      <textarea
        value={idea.description}
        onChange={(e) => onChange({ ...idea, description: e.target.value })}
        readOnly={!canManage}
        placeholder="O que vai conter este conteúdo?"
        rows={2}
        style={{ ...sans, width: "100%", fontSize: 12.5, color: c.ink, border: `1px solid ${c.line}`, borderRadius: 8, padding: "8px 10px", outline: "none", resize: "vertical", background: "#fff", marginBottom: 6 }}
      />
      <input
        value={idea.inspiration}
        onChange={(e) => onChange({ ...idea, inspiration: e.target.value })}
        readOnly={!canManage}
        placeholder="Inspiração de design ou reel (opcional)"
        style={{ ...sans, width: "100%", fontSize: 11.5, color: c.mist, border: `1px solid ${c.line}`, borderRadius: 8, padding: "7px 10px", outline: "none", background: "#fff" }}
      />
    </div>
  );
}

function ScheduleDetail({ schedule: initial, onBack, brandId, canManage }) {
  const [schedule, onChange] = useState(initial);
  const saveSchedule = useSaveContentSchedule(brandId);
  const deleteSchedule = useDeleteContentSchedule(brandId);

  const updateField = (field, value) => onChange((s) => ({ ...s, [field]: value }));

  const addAction = () =>
    onChange((s) => ({ ...s, specificActions: [...s.specificActions, { id: Date.now(), timing: TIMING_OPTIONS[0], label: "Nova ação", description: "" }] }));
  const updateAction = (id, patch) =>
    onChange((s) => ({ ...s, specificActions: s.specificActions.map((a) => (a.id === id ? { ...a, ...patch } : a)) }));
  const removeAction = (id) =>
    onChange((s) => ({ ...s, specificActions: s.specificActions.filter((a) => a.id !== id) }));

  const addWeek = () =>
    onChange((s) => ({ ...s, weeks: [...s.weeks, { id: Date.now(), label: `Semana ${s.weeks.length + 1}`, action: "", contentIdeas: [] }] }));
  const removeWeek = (id) =>
    onChange((s) => ({ ...s, weeks: s.weeks.filter((w) => w.id !== id) }));
  const updateWeek = (id, patch) =>
    onChange((s) => ({ ...s, weeks: s.weeks.map((w) => (w.id === id ? { ...w, ...patch } : w)) }));
  const addIdea = (weekId) =>
    onChange((s) => ({
      ...s,
      weeks: s.weeks.map((w) => (w.id === weekId ? { ...w, contentIdeas: [...w.contentIdeas, { id: Date.now(), type: "Carrossel", description: "", inspiration: "" }] } : w)),
    }));
  const updateIdea = (weekId, ideaId, updated) =>
    onChange((s) => ({
      ...s,
      weeks: s.weeks.map((w) => (w.id === weekId ? { ...w, contentIdeas: w.contentIdeas.map((i) => (i.id === ideaId ? updated : i)) } : w)),
    }));
  const removeIdea = (weekId, ideaId) =>
    onChange((s) => ({
      ...s,
      weeks: s.weeks.map((w) => (w.id === weekId ? { ...w, contentIdeas: w.contentIdeas.filter((i) => i.id !== ideaId) } : w)),
    }));

  return (
    <div className="bb-page" style={{ padding: "8px 40px 60px", maxWidth: 1080 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <button onClick={onBack} style={{ ...sans, display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: c.mist, background: "none", border: "none", cursor: "pointer" }}>
          <ArrowLeft size={14} /> Cronograma de Conteúdos
        </button>
        {canManage && (
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => saveSchedule.mutate(schedule)}
              disabled={saveSchedule.isPending}
              style={{ ...sans, display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, color: "#fff", background: c.boss, border: "none", borderRadius: 8, padding: "7px 14px", cursor: "pointer" }}
            >
              {saveSchedule.isPending ? "A guardar…" : "Guardar"}
            </button>
            <button
              onClick={() => deleteSchedule.mutate(schedule.id, { onSuccess: onBack })}
              style={{ ...sans, display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: c.rose, background: "none", border: `1px solid ${c.line}`, borderRadius: 8, padding: "7px 12px", cursor: "pointer" }}
            >
              <Trash2 size={13} /> Eliminar
            </button>
          </div>
        )}
      </div>

      <input
        value={schedule.title}
        onChange={(e) => updateField("title", e.target.value)}
        readOnly={!canManage}
        style={{ ...serif, fontSize: 27, color: c.ink, border: "none", outline: "none", background: "none", width: "100%", marginBottom: 18 }}
      />

      <div
        style={{
          background: `linear-gradient(135deg, ${c.bossSoft} 0%, #FFFFFF 65%)`, border: `1px solid ${c.line}`, borderRadius: 14,
          padding: "18px 22px", marginBottom: 20, position: "relative", overflow: "hidden",
        }}
      >
        <div style={{ position: "absolute", top: 0, left: 0, bottom: 0, width: 3, background: `linear-gradient(180deg, ${c.boss}, ${c.bossDeep})` }} />
        <div style={{ ...sans, fontSize: 10.5, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: c.boss, marginBottom: 8 }}>
          Foco deste período
        </div>
        <textarea
          value={schedule.focus}
          onChange={(e) => updateField("focus", e.target.value)}
          readOnly={!canManage}
          placeholder="Ex: Autoridade, Conversão, lançamento de um serviço específico..."
          rows={2}
          style={{ ...sans, width: "100%", fontSize: 13.5, color: c.ink, lineHeight: 1.55, border: "none", outline: "none", background: "none", resize: "vertical" }}
        />
      </div>

      <ChartCard
        title="Ações específicas do mês"
        sub="Eventos ou ações pontuais — podem ser várias, em qualquer altura do mês"
        right={
          canManage && (
            <button onClick={addAction} style={{ ...sans, display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, color: "#fff", background: c.boss, border: "none", borderRadius: 7, padding: "7px 12px", cursor: "pointer" }}>
              <Plus size={13} /> Ação
            </button>
          )
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {schedule.specificActions.map((a) => (
            <div key={a.id} style={{ background: c.paper, borderRadius: 10, padding: "12px 14px" }}>
              <div style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
                <select
                  value={a.timing}
                  onChange={(e) => updateAction(a.id, { timing: e.target.value })}
                  disabled={!canManage}
                  style={{ ...sans, fontSize: 11, fontWeight: 600, color: c.boss, background: c.bossSoft, border: "none", borderRadius: 6, padding: "5px 8px", cursor: canManage ? "pointer" : "default" }}
                >
                  {TIMING_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <input
                  value={a.label}
                  onChange={(e) => updateAction(a.id, { label: e.target.value })}
                  readOnly={!canManage}
                  style={{ ...sans, flex: 1, fontSize: 13, fontWeight: 600, color: c.ink, border: "none", outline: "none", background: "none" }}
                />
                {canManage && (
                  <button onClick={() => removeAction(a.id)} style={{ background: "none", border: "none", cursor: "pointer", color: c.rose, flexShrink: 0 }}>
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
              <textarea
                value={a.description}
                onChange={(e) => updateAction(a.id, { description: e.target.value })}
                readOnly={!canManage}
                rows={2}
                placeholder="Descreve a ação..."
                style={{ ...sans, width: "100%", fontSize: 12.5, color: c.mist, border: `1px solid ${c.line}`, borderRadius: 8, padding: "8px 10px", outline: "none", background: "#fff", resize: "vertical" }}
              />
            </div>
          ))}
          {schedule.specificActions.length === 0 && (
            <div style={{ ...sans, fontSize: 12, color: c.mistLight, textAlign: "center", padding: "10px 0" }}>Sem ações específicas ainda.</div>
          )}
        </div>
      </ChartCard>

      <div style={{ marginTop: 20, display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <h2 style={{ ...serif, fontSize: 17, color: c.ink, fontWeight: 500, margin: 0 }}>Semanas</h2>
        {canManage && (
          <button onClick={addWeek} style={{ ...sans, display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, color: c.boss, background: c.bossSoft, border: "none", borderRadius: 7, padding: "7px 12px", cursor: "pointer" }}>
            <Plus size={13} /> Adicionar semana
          </button>
        )}
      </div>
      <div style={{ ...sans, fontSize: 11.5, color: c.mistLight, marginBottom: 14 }}>
        Mínimo de 1 mês (4 semanas) — adiciona quantas semanas ou meses precisares.
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {schedule.weeks.map((w) => (
          <div key={w.id} style={{ background: "#fff", border: `1px solid ${c.line}`, borderRadius: 14, padding: "18px 20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <input
                value={w.label}
                onChange={(e) => updateWeek(w.id, { label: e.target.value })}
                readOnly={!canManage}
                style={{ ...serif, fontSize: 15.5, color: c.ink, border: "none", outline: "none", background: "none", width: 110, flexShrink: 0 }}
              />
              <input
                value={w.action}
                onChange={(e) => updateWeek(w.id, { action: e.target.value })}
                readOnly={!canManage}
                placeholder="Ação que queres que o cliente faça esta semana..."
                style={{ ...sans, flex: 1, fontSize: 12.5, color: c.ink, border: `1px solid ${c.line}`, borderRadius: 8, padding: "7px 10px", outline: "none" }}
              />
              {canManage && (
                <button onClick={() => removeWeek(w.id)} style={{ background: "none", border: "none", cursor: "pointer", color: c.mist, flexShrink: 0 }}>
                  <Trash2 size={14} />
                </button>
              )}
            </div>
            <div style={{ ...sans, fontSize: 10.5, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: c.mist, marginBottom: 8 }}>
              Ideias de conteúdo
            </div>
            {w.contentIdeas.map((idea) => (
              <ContentIdeaRow
                key={idea.id}
                idea={idea}
                canManage={canManage}
                onChange={(updated) => updateIdea(w.id, idea.id, updated)}
                onRemove={() => removeIdea(w.id, idea.id)}
              />
            ))}
            {canManage && (
              <button
                onClick={() => addIdea(w.id)}
                style={{ ...sans, display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 600, color: c.boss, background: "none", border: `1px dashed ${c.line}`, borderRadius: 8, padding: "8px 10px", cursor: "pointer", width: "100%", justifyContent: "center", marginTop: 4 }}
              >
                <Plus size={12} /> Adicionar ideia de conteúdo
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function CronogramaConteudosView({ brand, onBack, session }) {
  const [openId, setOpenId] = useState(null);
  const canManage = CAN_MANAGE_ROLES.includes(session.role);
  const schedulesQuery = useContentSchedules(brand.id, true);
  const addSchedule = useAddContentSchedule(brand.id);
  const deleteSchedule = useDeleteContentSchedule(brand.id);
  const schedules = schedulesQuery.data || [];
  const schedule = schedules.find((s) => s.id === openId);

  const createSchedule = async () => {
    const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
    const now = new Date();
    const newSchedule = await addSchedule.mutateAsync({ title: `Cronograma — ${monthNames[now.getMonth()]} ${now.getFullYear()}` });
    setOpenId(newSchedule.id);
  };

  if (schedule) {
    return <ScheduleDetail schedule={schedule} onBack={() => setOpenId(null)} brandId={brand.id} canManage={canManage} />;
  }

  return (
    <div className="bb-page" style={{ padding: "8px 40px 60px", maxWidth: 1040 }}>
      <button onClick={onBack} style={{ ...sans, display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: c.mist, background: "none", border: "none", cursor: "pointer", marginBottom: 20 }}>
        <ArrowLeft size={14} /> {brand.name}
      </button>
      <Eyebrow>Cronograma de Conteúdos</Eyebrow>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <h1 style={{ ...serif, fontSize: 27, fontWeight: 500, color: c.ink, margin: 0 }}>Planeamento do que vai sair</h1>
        {canManage && (
          <button
            onClick={createSchedule}
            disabled={addSchedule.isPending}
            style={{ ...sans, display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, color: "#fff", background: c.boss, border: "none", borderRadius: 8, padding: "9px 16px", cursor: "pointer" }}
          >
            <Plus size={14} /> {addSchedule.isPending ? "A criar…" : "Novo cronograma"}
          </button>
        )}
      </div>
      <div style={{ ...sans, fontSize: 12.5, color: c.mist, marginBottom: 24, maxWidth: 600, lineHeight: 1.6 }}>
        Distinto de "Conteúdos" (que é aprovação) — aqui planeias o que ainda vai ser criado: o foco do período, ações específicas, e as ideias de conteúdo semana a semana.
      </div>

      {schedulesQuery.isLoading && <div style={{ ...sans, fontSize: 13, color: c.mist }}>A carregar…</div>}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {schedules.map((s) => {
          const ideaCount = s.weeks.reduce((sum, w) => sum + w.contentIdeas.length, 0);
          return (
            <div
              key={s.id}
              onClick={() => setOpenId(s.id)}
              style={{ display: "flex", alignItems: "center", gap: 14, background: "#fff", border: `1px solid ${c.line}`, borderRadius: 12, padding: "14px 18px", cursor: "pointer" }}
            >
              <div style={{ width: 34, height: 34, borderRadius: 9, background: c.bossSoft, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Calendar size={16} color={c.boss} strokeWidth={1.8} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ ...serif, fontSize: 15, color: c.ink, fontWeight: 500 }}>{s.title}</div>
                <div style={{ ...sans, fontSize: 11.5, color: c.mist, marginTop: 2 }}>
                  {s.weeks.length} semanas · {ideaCount} ideias de conteúdo
                </div>
              </div>
              {canManage && (
                <button
                  onClick={(e) => { e.stopPropagation(); deleteSchedule.mutate(s.id); }}
                  style={{ background: "none", border: "none", cursor: "pointer", color: c.mist, padding: 4, flexShrink: 0 }}
                >
                  <Trash2 size={15} />
                </button>
              )}
              <ChevronRight size={16} color={c.mist} />
            </div>
          );
        })}
        {!schedulesQuery.isLoading && schedules.length === 0 && (
          <div style={{ ...sans, fontSize: 13, color: c.mistLight, textAlign: "center", padding: "40px 0" }}>
            Ainda sem cronogramas — cria o primeiro acima (mínimo de 1 mês).
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
   PLACEHOLDER — módulos ainda por construir
--------------------------------------------------------- */
function EmConstrucao({ label, onBack }) {
  return (
    <div className="bb-page" style={{ padding: "8px 40px 60px", maxWidth: 1040 }}>
      <button
        onClick={onBack}
        style={{
          ...sans,
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 12.5,
          color: c.mist,
          background: "none",
          border: "none",
          cursor: "pointer",
          marginBottom: 20,
        }}
      >
        <ArrowLeft size={14} /> Voltar
      </button>
      <div
        style={{
          background: "#fff",
          border: `1px dashed ${c.line}`,
          borderRadius: 16,
          padding: "60px 30px",
          textAlign: "center",
        }}
      >
        <Sparkles size={22} color={c.boss} style={{ margin: "0 auto 14px" }} />
        <div style={{ ...serif, fontSize: 19, color: c.ink }}>{label}</div>
        <div style={{ ...sans, fontSize: 13, color: c.mist, marginTop: 6 }}>
          Este módulo entra na próxima ronda do protótipo.
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
   APP
--------------------------------------------------------- */
/* ---------------------------------------------------------
   AUTENTICAÇÃO
--------------------------------------------------------- */
const ROLES = [
  { key: "admin_geral", label: "Admin Geral", desc: "Acesso total à plataforma, todas as agências e marcas." },
  { key: "membro", label: "Membro Biamelo", desc: "Equipa interna — acesso operacional às marcas atribuídas." },
  { key: "aprovador_marca", label: "Cliente (Aprovador de Marca)", desc: "Acesso de aprovação a conteúdos e roteiros da sua marca." },
  { key: "agencia_admin", label: "Admin de Agência", desc: "Gere uma agência parceira e as suas marcas, com dados isolados." },
  { key: "agencia_membro", label: "Membro de Agência", desc: "Equipa de uma agência parceira — acesso operacional." },
  { key: "agencia_aprovador", label: "Cliente de Agência (Aprovador)", desc: "Acesso de aprovação dentro de uma agência parceira." },
];

const AUTH_ERROR_MESSAGES = {
  "Invalid login credentials": "Email ou password incorretos.",
  "Email not confirmed": "Confirma o teu email antes de entrares.",
};

function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotError, setForgotError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError("Preenche o email e a password para continuar.");
      return;
    }
    setError("");
    setLoading(true);
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setLoading(false);
    if (authError) {
      setError(AUTH_ERROR_MESSAGES[authError.message] || authError.message);
    }
    // Em caso de sucesso não há mais nada a fazer aqui — o listener
    // onAuthStateChange no componente raiz trata de construir a sessão.
  };

  const sendResetLink = async () => {
    if (!forgotEmail.trim()) {
      setForgotError("Introduz o teu email.");
      return;
    }
    setForgotError("");
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      forgotEmail.trim()
    );
    if (resetError) {
      setForgotError(resetError.message);
      return;
    }
    setForgotSent(true);
  };

  return (
    <div style={{ minHeight: "100vh", background: c.paper, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, ...sans }}>
      <style>{FONTS}</style>
      <div style={{ width: "100%", maxWidth: 420 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 9, marginBottom: 28 }}>
          <div
            style={{
              width: 36, height: 36, borderRadius: 11, background: `linear-gradient(135deg, ${c.boss}, ${c.bossDeep})`,
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}
          >
            <Sparkles size={18} color="#fff" strokeWidth={2} />
          </div>
          <div>
            <div style={{ ...serif, color: c.ink, fontSize: 20, fontWeight: 600, lineHeight: 1.1 }}>Big Boss</div>
            <div style={{ ...sans, color: c.mistLight, fontSize: 10.5, letterSpacing: "0.1em" }}>BIAMELO</div>
          </div>
        </div>

        <form onSubmit={submit} style={{ background: "#fff", border: `1px solid ${c.line}`, borderRadius: 18, padding: 28 }}>
          <div style={{ ...serif, fontSize: 21, color: c.ink, marginBottom: 4 }}>Entrar</div>
          <div style={{ ...sans, fontSize: 12.5, color: c.mist, marginBottom: 22 }}>Acede à tua plataforma de gestão de marcas.</div>

          <div style={{ marginBottom: 14 }}>
            <div style={{ ...sans, fontSize: 11.5, color: c.mist, marginBottom: 5 }}>Email</div>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@biamelo.com"
              style={{ ...sans, width: "100%", fontSize: 14, border: `1px solid ${c.line}`, borderRadius: 9, padding: "10px 13px", outline: "none", color: c.ink }}
            />
          </div>
          <div style={{ marginBottom: 8 }}>
            <div style={{ ...sans, fontSize: 11.5, color: c.mist, marginBottom: 5 }}>Password</div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              style={{ ...sans, width: "100%", fontSize: 14, border: `1px solid ${c.line}`, borderRadius: 9, padding: "10px 13px", outline: "none", color: c.ink }}
            />
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 18 }}>
            <button
              type="button"
              onClick={() => setForgotOpen((v) => !v)}
              style={{ ...sans, fontSize: 11.5, color: c.boss, background: "none", border: "none", cursor: "pointer", padding: 0 }}
            >
              Esqueci-me da password
            </button>
          </div>

          {forgotOpen && (
            <div style={{ background: c.paper, borderRadius: 10, padding: 14, marginBottom: 18 }}>
              {forgotSent ? (
                <div style={{ ...sans, fontSize: 12, color: c.sage, display: "flex", alignItems: "center", gap: 6 }}>
                  <CheckCircle2 size={14} /> Link de recuperação enviado para {forgotEmail || "o teu email"}.
                </div>
              ) : (
                <>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <input
                      type="email"
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      placeholder="O teu email"
                      style={{ ...sans, flex: 1, minWidth: 140, fontSize: 12.5, border: `1px solid ${c.line}`, borderRadius: 8, padding: "8px 11px", outline: "none", color: c.ink }}
                    />
                    <button
                      type="button"
                      onClick={sendResetLink}
                      style={{ ...sans, fontSize: 12, fontWeight: 600, color: "#fff", background: c.boss, border: "none", borderRadius: 8, padding: "8px 13px", cursor: "pointer" }}
                    >
                      Enviar link
                    </button>
                  </div>
                  {forgotError && (
                    <div style={{ ...sans, fontSize: 11.5, color: c.rose, marginTop: 8 }}>{forgotError}</div>
                  )}
                </>
              )}
            </div>
          )}

          {error && (
            <div style={{ ...sans, fontSize: 12, color: c.rose, background: "#FBE9EC", borderRadius: 8, padding: "8px 12px", marginBottom: 14, display: "flex", alignItems: "center", gap: 6 }}>
              <XCircle size={13} /> {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{ ...sans, width: "100%", fontSize: 14, fontWeight: 600, color: "#fff", background: c.boss, border: "none", borderRadius: 10, padding: "11px 14px", cursor: loading ? "default" : "pointer", opacity: loading ? 0.7 : 1 }}
          >
            {loading ? "A entrar…" : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}

function DevRoleSwitcher({ role, onChange }) {
  const [open, setOpen] = useState(false);
  const current = ROLES.find((r) => r.key === role) || ROLES[0];
  return (
    <div style={{ position: "fixed", bottom: 16, left: 16, zIndex: 60 }}>
      {open && (
        <div style={{ background: "#fff", border: `1px solid ${c.line}`, borderRadius: 12, boxShadow: "0 12px 30px rgba(23,21,31,0.18)", padding: 10, marginBottom: 8, width: 260, maxHeight: "60vh", overflowY: "auto" }}>
          <div style={{ ...sans, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: c.mistLight, padding: "2px 4px 8px" }}>
            Só no protótipo — simular perfil
          </div>
          {ROLES.map((r) => (
            <button
              key={r.key}
              onClick={() => { onChange(r.key); setOpen(false); }}
              style={{
                display: "block", width: "100%", textAlign: "left", cursor: "pointer", borderRadius: 8, padding: "8px 10px", marginBottom: 2,
                border: "none", background: r.key === role ? c.bossSoft : "transparent",
              }}
            >
              <div style={{ ...sans, fontSize: 12, fontWeight: 600, color: r.key === role ? c.boss : c.ink }}>{r.label}</div>
              <div style={{ ...sans, fontSize: 10, color: c.mist, lineHeight: 1.4, marginTop: 1 }}>{r.desc}</div>
            </button>
          ))}
        </div>
      )}
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          ...sans, display: "flex", alignItems: "center", gap: 7, fontSize: 11, fontWeight: 600, color: c.mist,
          background: "#fff", border: `1px dashed ${c.line}`, borderRadius: 999, padding: "7px 12px", cursor: "pointer",
          boxShadow: "0 4px 14px rgba(23,21,31,0.08)",
        }}
      >
        <Eye size={12} /> A ver como: {current.label}
      </button>
    </div>
  );
}

async function loadSessionFromAuthUser(authUser) {
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, name, email, role, agency_id, brand_ids, avatar_url")
    .eq("id", authUser.id)
    .single();
  if (error || !profile) {
    return { profileMissing: true, email: authUser.email };
  }
  return { ...profile };
}

/* ---------------------------------------------------------
   PÁGINAS PÚBLICAS — sem login, acesso por slug/id exato
--------------------------------------------------------- */
function PublicPageShell({ children }) {
  return (
    <div style={{ minHeight: "100vh", background: c.paper, ...sans }}>
      <style>{FONTS}</style>
      {children}
    </div>
  );
}

function PublicStateMessage({ text }) {
  return (
    <PublicPageShell>
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ ...sans, fontSize: 13, color: c.mist }}>{text}</div>
      </div>
    </PublicPageShell>
  );
}

export function PublicProposalPage() {
  const { slug } = useParams();
  const [state, setState] = useState({ loading: true, error: null, proposal: null });

  useEffect(() => {
    let active = true;
    supabase
      .from("proposals")
      .select("client_name, branding_color, phases, status")
      .eq("slug", slug)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active) return;
        if (error || !data) setState({ loading: false, error: "Proposta não encontrada.", proposal: null });
        else setState({ loading: false, error: null, proposal: data });
      });
    return () => { active = false; };
  }, [slug]);

  if (state.loading) return <PublicStateMessage text="A carregar…" />;
  if (state.error) return <PublicStateMessage text={state.error} />;

  const p = state.proposal;
  return (
    <PublicPageShell>
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "60px 24px" }}>
        <div
          style={{
            background: `linear-gradient(135deg, ${p.branding_color}18, #FFFFFF 65%)`,
            border: `1px solid ${c.line}`, borderRadius: 16, padding: "26px 30px", marginBottom: 28,
            position: "relative", overflow: "hidden",
          }}
        >
          <div style={{ position: "absolute", top: 0, left: 0, bottom: 0, width: 3, background: p.branding_color }} />
          <Eyebrow>Proposta comercial</Eyebrow>
          <div style={{ ...serif, fontSize: 26, color: c.ink }}>Para {p.client_name}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {p.phases.map((ph, i) => (
            <div key={i} style={{ background: "#fff", border: `1px solid ${c.line}`, borderRadius: 14, padding: "18px 22px", display: "flex", gap: 16 }}>
              <div
                style={{
                  width: 30, height: 30, borderRadius: 999, background: `${p.branding_color}1A`, color: p.branding_color,
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, ...sans, fontSize: 12.5, fontWeight: 700,
                }}
              >
                {i + 1}
              </div>
              <div>
                <div style={{ ...serif, fontSize: 16, color: c.ink, marginBottom: 4 }}>{ph.title}</div>
                <div style={{ ...sans, fontSize: 12.5, color: c.mist, lineHeight: 1.55 }}>{ph.description}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </PublicPageShell>
  );
}

function PublicSlide({ slide, brandingColor }) {
  const boxStyle = {
    background: "#fff", border: `1px solid ${c.line}`, borderRadius: 16, minHeight: 320,
    padding: "40px 36px", position: "relative", overflow: "hidden", display: "flex", flexDirection: "column", justifyContent: "center",
  };
  const accent = <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: brandingColor }} />;

  if (slide.type === "stat") {
    return (
      <div style={boxStyle}>
        {accent}
        <div style={{ ...serif, fontSize: 48, color: brandingColor, marginBottom: 8 }}>{slide.value}</div>
        <div style={{ ...sans, fontSize: 15, fontWeight: 600, color: c.ink, marginBottom: 10 }}>{slide.label}</div>
        <div style={{ ...sans, fontSize: 13, color: c.mist, lineHeight: 1.6, maxWidth: 460 }}>{slide.body}</div>
      </div>
    );
  }
  if (slide.type === "quote") {
    return (
      <div style={{ ...boxStyle, alignItems: "center", textAlign: "center" }}>
        {accent}
        <div style={{ ...serif, fontSize: 20, color: c.ink, lineHeight: 1.5, maxWidth: 480, marginBottom: 12 }}>&ldquo;{slide.quote}&rdquo;</div>
        <div style={{ ...sans, fontSize: 12.5, color: c.mist }}>{slide.author}</div>
      </div>
    );
  }
  if (slide.type === "image") {
    return (
      <div style={{ ...boxStyle, padding: 0 }}>
        {accent}
        <div style={{ height: 220, background: slide.imageUrl ? `url(${slide.imageUrl}) center/cover` : c.paper }} />
        <div style={{ padding: "22px 28px" }}>
          <div style={{ ...serif, fontSize: 20, color: c.ink, marginBottom: 6 }}>{slide.heading}</div>
          <div style={{ ...sans, fontSize: 13, color: c.mist, lineHeight: 1.6 }}>{slide.body}</div>
        </div>
      </div>
    );
  }
  if (slide.type === "video") {
    return (
      <div style={boxStyle}>
        {accent}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, background: c.paper, borderRadius: 10, padding: "10px 14px" }}>
          <Video size={16} color={brandingColor} strokeWidth={1.8} />
          <span style={{ ...sans, fontSize: 12.5, color: c.ink }}>{slide.body}</span>
        </div>
        <div style={{ ...serif, fontSize: 22, color: c.ink }}>{slide.heading}</div>
      </div>
    );
  }
  if (slide.type === "split") {
    return (
      <div style={boxStyle}>
        {accent}
        <div style={{ ...serif, fontSize: 20, color: c.ink, marginBottom: 16 }}>{slide.heading}</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div style={{ background: c.paper, borderRadius: 10, padding: "16px 18px", ...sans, fontSize: 13, fontWeight: 600, color: c.ink }}>{slide.leftLabel}</div>
          <div style={{ background: c.paper, borderRadius: 10, padding: "16px 18px", ...sans, fontSize: 13, fontWeight: 600, color: c.ink }}>{slide.rightLabel}</div>
        </div>
      </div>
    );
  }
  return (
    <div style={boxStyle}>
      {accent}
      <div style={{ ...serif, fontSize: 28, color: c.ink, marginBottom: 6 }}>{slide.heading}</div>
      {slide.subheading && <div style={{ ...sans, fontSize: 13, fontWeight: 600, color: brandingColor, marginBottom: 12 }}>{slide.subheading}</div>}
      <div style={{ ...sans, fontSize: 14, color: c.mist, lineHeight: 1.6, maxWidth: 480 }}>{slide.body}</div>
    </div>
  );
}

export function PublicPresentationPage() {
  const { id } = useParams();
  const [i, setI] = useState(0);
  const [state, setState] = useState({ loading: true, error: null, deck: null });

  useEffect(() => {
    let active = true;
    supabase
      .from("presentations")
      .select("title, branding_color, slides")
      .eq("id", id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active) return;
        if (error || !data) setState({ loading: false, error: "Apresentação não encontrada.", deck: null });
        else setState({ loading: false, error: null, deck: data });
      });
    return () => { active = false; };
  }, [id]);

  if (state.loading) return <PublicStateMessage text="A carregar…" />;
  if (state.error) return <PublicStateMessage text={state.error} />;

  const deck = state.deck;
  const slide = deck.slides[i];
  return (
    <PublicPageShell>
      <div style={{ maxWidth: 780, margin: "0 auto", padding: "60px 24px" }}>
        <div style={{ ...serif, fontSize: 22, color: c.ink, marginBottom: 20, textAlign: "center" }}>{deck.title}</div>
        <PublicSlide slide={slide} brandingColor={deck.branding_color || c.boss} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 18 }}>
          <button
            onClick={() => setI((p) => Math.max(0, p - 1))}
            disabled={i === 0}
            style={{ ...sans, fontSize: 12.5, fontWeight: 600, color: i === 0 ? c.mistLight : c.boss, background: "none", border: "none", cursor: i === 0 ? "default" : "pointer" }}
          >
            ← Anterior
          </button>
          <span style={{ ...sans, fontSize: 11.5, color: c.mist }}>{i + 1} / {deck.slides.length}</span>
          <button
            onClick={() => setI((p) => Math.min(deck.slides.length - 1, p + 1))}
            disabled={i === deck.slides.length - 1}
            style={{ ...sans, fontSize: 12.5, fontWeight: 600, color: i === deck.slides.length - 1 ? c.mistLight : c.boss, background: "none", border: "none", cursor: i === deck.slides.length - 1 ? "default" : "pointer" }}
          >
            Seguinte →
          </button>
        </div>
      </div>
    </PublicPageShell>
  );
}

export function PublicLinkPage() {
  const { slug } = useParams();
  const [state, setState] = useState({ loading: true, error: null, page: null });

  useEffect(() => {
    let active = true;
    supabase
      .from("link_pages")
      .select("profile_photo_url, background_removed, background_style, about_text, blocks, quiz")
      .eq("slug", slug)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active) return;
        if (error || !data) {
          setState({ loading: false, error: "Página não encontrada.", page: null });
          return;
        }
        setState({
          loading: false,
          error: null,
          page: {
            ownerName: "",
            about: data.about_text || "",
            avatarUrl: data.profile_photo_url,
            avatarBgRemoved: !!data.background_removed,
            bg: data.background_style && Object.keys(data.background_style).length ? data.background_style : DEFAULT_LINK_BG,
            blocks: data.blocks || [],
            quizEnabled: !!(data.quiz && data.quiz.enabled),
          },
        });
      });
    return () => { active = false; };
  }, [slug]);

  if (state.loading) return <PublicStateMessage text="A carregar…" />;
  if (state.error) return <PublicStateMessage text={state.error} />;

  return (
    <PublicPageShell>
      <div style={{ display: "flex", justifyContent: "center", padding: "60px 20px" }}>
        <div style={{ width: "100%", maxWidth: 360 }}>
          <LinkPagePreview page={state.page} />
        </div>
      </div>
    </PublicPageShell>
  );
}

export default function BigBossPrototype() {
  const [session, setSession] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [nav, setNav] = useState("painel");
  const [brandId, setBrandId] = useState(null);
  const [sub, setSub] = useState(null);
  const [addBrandError, setAddBrandError] = useState("");

  const brandsQuery = useBrands(authChecked && !!session && !session.profileMissing);
  const addBrandMutation = useAddBrand();
  const brands = brandsQuery.data || [];

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      if (data.session?.user) {
        setSession(await loadSessionFromAuthUser(data.session.user));
      }
      setAuthChecked(true);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      async (_event, authSession) => {
        if (!active) return;
        if (authSession?.user) {
          setSession(await loadSessionFromAuthUser(authSession.user));
        } else {
          setSession(null);
        }
        setAuthChecked(true);
        setNav("painel");
        setBrandId(null);
        setSub(null);
      }
    );

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  if (!authChecked) {
    return (
      <div style={{ minHeight: "100vh", background: c.paper, display: "flex", alignItems: "center", justifyContent: "center", ...sans }}>
        <style>{FONTS}</style>
        <div style={{ color: c.mist, fontSize: 13 }}>A carregar…</div>
      </div>
    );
  }

  if (!session) {
    return <LoginPage />;
  }

  if (session.profileMissing) {
    return (
      <div style={{ minHeight: "100vh", background: c.paper, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, ...sans }}>
        <style>{FONTS}</style>
        <div style={{ maxWidth: 420, background: "#fff", border: `1px solid ${c.line}`, borderRadius: 18, padding: 28, textAlign: "center" }}>
          <div style={{ ...serif, fontSize: 19, color: c.ink, marginBottom: 10 }}>Conta sem perfil associado</div>
          <div style={{ ...sans, fontSize: 13, color: c.mist, marginBottom: 20, lineHeight: 1.5 }}>
            A conta <strong>{session.email}</strong> está autenticada mas ainda não tem uma linha na tabela
            <code> profiles</code>. Segue a secção 4 do README para associares um perfil e um papel (role) a este email.
          </div>
          <button
            onClick={() => supabase.auth.signOut()}
            style={{ ...sans, fontSize: 13, fontWeight: 600, color: "#fff", background: c.boss, border: "none", borderRadius: 9, padding: "10px 18px", cursor: "pointer" }}
          >
            Sair
          </button>
        </div>
      </div>
    );
  }

  const logout = () => {
    supabase.auth.signOut();
  };

  const roleInfo = ROLES.find((r) => r.key === session.role) || ROLES[0];

  const previewAs = (roleKey) => {
    setSession((prev) => ({ ...prev, role: roleKey }));
    const allowed = NAV_ACCESS[roleKey];
    if (allowed !== "all" && allowed && !allowed.includes(nav)) {
      setNav("painel");
      setBrandId(null);
      setSub(null);
    }
  };

  const openBrand = (id) => {
    setBrandId(id);
    setSub(null);
    setNav("marcas");
  };
  const goToNav = (key) => {
    setNav(key);
    setBrandId(null);
    setSub(null);
  };
  const addBrand = async () => {
    setAddBrandError("");
    try {
      const newBrand = await addBrandMutation.mutateAsync(session);
      openBrand(newBrand.id);
    } catch (err) {
      setAddBrandError(err.message || "Não foi possível criar a marca.");
    }
  };

  const brand = brands.find((b) => b.id === brandId);

  let content;
  if (nav === "painel") {
    content = <PainelGlobal brands={brands} onOpenBrand={openBrand} onNavigate={goToNav} />;
  } else if (nav === "marcas" && !brandId) {
    content = (
      <MarcasList
        brands={brands}
        onOpenBrand={openBrand}
        onAddBrand={addBrand}
        addBrandError={addBrandError}
        addingBrand={addBrandMutation.isPending}
      />
    );
  } else if (nav === "marcas" && brandId) {
    content = brand ? (
      <MarcaDetail
        brand={brand}
        onBack={() => setBrandId(null)}
        sub={sub}
        onOpenSub={setSub}
        session={session}
      />
    ) : (
      <div className="bb-page" style={{ padding: "8px 40px 60px", color: c.mist, ...sans, fontSize: 13 }}>
        A carregar marca…
      </div>
    );
  } else if (nav === "reunioes") {
    content = <ReunioesModule session={session} />;
  } else if (nav === "propostas") {
    content = <PropostasModule session={session} />;
  } else if (nav === "centro") {
    content = <CentroComandoModule session={session} />;
  } else if (nav === "conhecimento") {
    content = <BaseConhecimentoModule session={session} />;
  } else if (nav === "portfolio") {
    content = <PortfolioModule session={session} />;
  } else if (nav === "link") {
    content = <LinkNaBioModule session={session} />;
  } else if (nav === "precificacao") {
    content = <CalculadoraModule session={session} />;
  } else if (nav === "equipa") {
    content = <EquipaModule session={session} />;
  } else if (nav === "definicoes") {
    content = <DefinicoesModule session={session} />;
  } else {
    content = <EmConstrucao label={nav} onBack={() => setNav("painel")} />;
  }

  return (
    <div className="bb-app" style={{ display: "flex", background: c.paper, minHeight: "100vh", ...sans }}>
      <style>{FONTS}</style>
      <Sidebar active={nav} onNavigate={goToNav} session={session} roleInfo={roleInfo} onLogout={logout} />
      <div style={{ flex: 1 }}>
        <TopBar onLogout={logout} />
        {content}
      </div>
      {import.meta.env.DEV && (
        <DevRoleSwitcher role={session.role} onChange={previewAs} />
      )}
    </div>
  );
}
