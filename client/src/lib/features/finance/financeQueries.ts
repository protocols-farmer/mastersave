//src/lib/features/finance/financeQueries.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../api/apiClient";
import type {
  DashboardResponse,
  UpdateRulesDTO,
  UpdateRulesResponse,
  TriggerDepositDTO,
  TriggerDepositResponse,
  SpendMoneyDTO,
  SpendMoneyResponse,
  SaveMoneyDTO,
  SaveMoneyResponse,
  GrowMoneyDTO,
  GrowMoneyResponse,
} from "./financeTypes";

export const FINANCE_QUERY_KEYS = {
  dashboard: ["finance", "dashboard"] as const,
};

export const useFinanceDashboardQuery = () => {
  return useQuery({
    queryKey: FINANCE_QUERY_KEYS.dashboard,
    queryFn: async () => {
      try {
        const response =
          await apiClient.get<DashboardResponse>("/finance/dashboard");
        return response.data.dashboard;
      } catch (error: unknown) {
        const err = error as {
          message?: string;
          response?: { data?: unknown };
        };
        console.error(`[API QUERY ERROR - Dashboard]: ${err.message}`);
        if (err.response) {
          console.error(
            `[API QUERY ERROR DETAILS]:`,
            JSON.stringify(err.response.data),
          );
        }
        throw error;
      }
    },
    staleTime: 1000 * 30, // 30 seconds
    refetchOnWindowFocus: true,
  });
};

export const useUpdateRulesMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: UpdateRulesDTO) => {
      try {
        const response = await apiClient.patch<UpdateRulesResponse>(
          "/finance/rules",
          payload,
        );
        return response.data;
      } catch (error: unknown) {
        const err = error as {
          message?: string;
          response?: { data?: unknown };
        };
        console.error(`[API QUERY ERROR - Update Rules]: ${err.message}`);
        if (err.response) {
          console.error(
            `[API QUERY ERROR DETAILS]:`,
            JSON.stringify(err.response.data),
          );
        }
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: FINANCE_QUERY_KEYS.dashboard });
    },
  });
};

export const useTriggerDepositMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: TriggerDepositDTO) => {
      try {
        const response = await apiClient.post<TriggerDepositResponse>(
          "/finance/deposit",
          payload,
        );
        return response.data;
      } catch (error: unknown) {
        const err = error as {
          message?: string;
          response?: { data?: unknown };
        };
        console.error(`[API QUERY ERROR - Trigger Deposit]: ${err.message}`);
        if (err.response) {
          console.error(
            `[API QUERY ERROR DETAILS]:`,
            JSON.stringify(err.response.data),
          );
        }
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: FINANCE_QUERY_KEYS.dashboard });
    },
  });
};

export const useSpendMoneyMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: SpendMoneyDTO) => {
      try {
        const response = await apiClient.post<SpendMoneyResponse>(
          "/finance/spend",
          payload,
        );
        return response.data;
      } catch (error: unknown) {
        const err = error as {
          message?: string;
          response?: { data?: unknown };
        };
        console.error(`[API QUERY ERROR - Spend Money]: ${err.message}`);
        if (err.response) {
          console.error(
            `[API QUERY ERROR DETAILS]:`,
            JSON.stringify(err.response.data),
          );
        }
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: FINANCE_QUERY_KEYS.dashboard });
    },
  });
};

export const useSaveMoneyMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: SaveMoneyDTO) => {
      try {
        const response = await apiClient.post<SaveMoneyResponse>(
          "/finance/save",
          payload,
        );
        return response.data;
      } catch (error: unknown) {
        const err = error as {
          message?: string;
          response?: { data?: unknown };
        };
        console.error(`[API QUERY ERROR - Save Money]: ${err.message}`);
        if (err.response) {
          console.error(
            `[API QUERY ERROR DETAILS]:`,
            JSON.stringify(err.response.data),
          );
        }
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: FINANCE_QUERY_KEYS.dashboard });
    },
  });
};

export const useGrowMoneyMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: GrowMoneyDTO) => {
      try {
        const response = await apiClient.post<GrowMoneyResponse>(
          "/finance/grow",
          payload,
        );
        return response.data;
      } catch (error: unknown) {
        const err = error as {
          message?: string;
          response?: { data?: unknown };
        };
        console.error(`[API QUERY ERROR - Grow Money]: ${err.message}`);
        if (err.response) {
          console.error(
            `[API QUERY ERROR DETAILS]:`,
            JSON.stringify(err.response.data),
          );
        }
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: FINANCE_QUERY_KEYS.dashboard });
    },
  });
};
