import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../lib/supabaseClient.js";

/* ---------------------------------------------------------
   DADOS DOS CONTRATOS — hooks partilhados pelo módulo da agência e
   pela aba "Contratos" de cada marca. Ver supabase/70_contracts.sql.
--------------------------------------------------------- */

// Contas admin_geral muitas vezes não têm agency_id no perfil — usa a
// agência raiz (mesmo fallback do resto da app).
export function useAgencyId(session) {
  return useQuery({
    queryKey: ["default_agency_id", session.agency_id],
    queryFn: async () => {
      if (session.agency_id) return session.agency_id;
      const { data, error } = await supabase.from("agencies").select("id").eq("is_root", true).maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Não foi encontrada uma agência para associar — a tua conta não tem agência definida.");
      return data.id;
    },
  });
}

export function useAgencyName(agencyId) {
  return useQuery({
    queryKey: ["agency_name", agencyId],
    enabled: !!agencyId,
    queryFn: async () => {
      const { data, error } = await supabase.from("agencies").select("name").eq("id", agencyId).maybeSingle();
      if (error) throw error;
      return data?.name || "";
    },
  });
}

// Contratos da agência (todas as marcas) ou de uma marca.
export function useContracts({ brandId } = {}) {
  return useQuery({
    queryKey: ["contracts", brandId || "all"],
    queryFn: async () => {
      let query = supabase
        .from("contracts")
        .select("id, agency_id, brand_id, title, body_html, status, counterparty_name, counterparty_email, body_hash, sent_at, agency_signed_at, counterparty_signed_at, completed_at, created_at, updated_at, brands(name)")
        .order("created_at", { ascending: false });
      if (brandId) query = query.eq("brand_id", brandId);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });
}

// O token do outro lado nunca é lido pelo browser (coluna revogada) — por
// isso as colunas são pedidas uma a uma, sem "select *".
export function useContractSigners(contractId, enabled = true) {
  return useQuery({
    queryKey: ["contract_signers", contractId],
    enabled: !!contractId && enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contract_signers")
        .select("id, role, name, email, signature_image, signed_at, signed_ip, signed_body_hash, first_viewed_at, last_viewed_at")
        .eq("contract_id", contractId);
      if (error) throw error;
      return data;
    },
  });
}

export const invalidateContracts = (qc) => {
  qc.invalidateQueries({ queryKey: ["contracts"] });
  qc.invalidateQueries({ queryKey: ["contract_signers"] });
};
