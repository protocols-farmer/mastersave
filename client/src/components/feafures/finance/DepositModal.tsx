// src/components/features/finance/DepositModal.tsx
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  KeyboardAvoidingView,
  Platform,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuthStore } from "../../../lib/features/auth/authStore";
import { useTriggerDepositMutation } from "../../../lib/features/finance/financeQueries";

interface DepositModalProps {
  visible: boolean;
  onClose: () => void;
}

export default function DepositModal({ visible, onClose }: DepositModalProps) {
  const { user } = useAuthStore();
  const depositMutation = useTriggerDepositMutation();

  const [amount, setAmount] = useState("");
  const [phone, setPhone] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  // Pre-fill their phone number when the modal opens
  useEffect(() => {
    if (visible) {
      setPhone(user?.phone_number || "");
      setAmount("");
      setErrorMessage("");
      setSuccessMessage("");
    }
  }, [visible, user]);

  const handleDeposit = () => {
    setErrorMessage("");
    setSuccessMessage("");

    const numericAmount = Number(amount);

    if (!amount || numericAmount < 100) {
      setErrorMessage("Minimum deposit is 100 RWF.");
      return;
    }

    if (!phone || phone.length < 10) {
      setErrorMessage("A valid Mobile Money number is required.");
      return;
    }

    depositMutation.mutate(
      {
        amount: numericAmount,
        phoneNumber: phone,
        email: user?.email || "student@mastersave.app",
      },
      {
        onSuccess: (data) => {
          setSuccessMessage(
            data.message ||
              "Prompt sent to your phone! Check your screen to enter your PIN.",
          );

          // Close modal automatically after 3 seconds of showing success
          setTimeout(() => {
            onClose();
          }, 3000);
        },
        onError: (err: any) => {
          setErrorMessage(
            err.response?.data?.error || "Failed to trigger MoMo prompt.",
          );
        },
      },
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.overlay}
      >
        <View style={styles.modalContent}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalTitle}>Deposit Stipend</Text>
              <Text style={styles.modalSub}>
                Funds will be split automatically.
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              disabled={depositMutation.isPending}
            >
              <Ionicons name="close-circle" size={28} color="#E5E7EB" />
            </TouchableOpacity>
          </View>

          {/* Feedback Messages */}
          {errorMessage ? (
            <Text style={styles.errorText}>{errorMessage}</Text>
          ) : null}
          {successMessage ? (
            <View style={styles.successBox}>
              <Ionicons name="checkmark-circle" size={20} color="#059669" />
              <Text style={styles.successText}>{successMessage}</Text>
            </View>
          ) : null}

          {/* Inputs */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>AMOUNT (RWF)</Text>
            <TextInput
              style={styles.inputField}
              placeholder="e.g. 50000"
              keyboardType="number-pad"
              value={amount}
              onChangeText={setAmount}
              editable={!depositMutation.isPending && !successMessage}
              placeholderTextColor="#9CA3AF"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>
              MTN/AIRTEL MOBILE MONEY NUMBER
            </Text>
            <TextInput
              style={styles.inputField}
              placeholder="+2507..."
              keyboardType="phone-pad"
              value={phone}
              onChangeText={setPhone}
              editable={!depositMutation.isPending && !successMessage}
              placeholderTextColor="#9CA3AF"
            />
          </View>

          {/* Action Button */}
          <TouchableOpacity
            style={[
              styles.actionBtn,
              (depositMutation.isPending || successMessage !== "") &&
                styles.actionBtnDisabled,
            ]}
            activeOpacity={0.8}
            onPress={handleDeposit}
            disabled={depositMutation.isPending || successMessage !== ""}
          >
            {depositMutation.isPending ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : successMessage ? (
              <Text style={styles.actionBtnText}>Waiting for PIN...</Text>
            ) : (
              <Text style={styles.actionBtnText}>Send Prompt to Phone</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(17, 24, 39, 0.6)", // Darker semi-transparent background
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    paddingBottom: Platform.OS === "ios" ? 40 : 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 20,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: "900",
    color: "#111827",
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  modalSub: {
    fontSize: 14,
    color: "#6B7280",
    fontWeight: "500",
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: "#9CA3AF",
    letterSpacing: 1,
    marginBottom: 8,
  },
  inputField: {
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 16,
    paddingHorizontal: 16,
    height: 56,
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
  },
  errorText: {
    color: "#DC2626",
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 16,
  },
  successBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ECFDF5",
    padding: 16,
    borderRadius: 12,
    gap: 8,
    marginBottom: 16,
  },
  successText: {
    flex: 1,
    color: "#059669",
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 20,
  },
  actionBtn: {
    backgroundColor: "#111827",
    height: 56,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 8,
  },
  actionBtnDisabled: {
    opacity: 0.7,
  },
  actionBtnText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
  },
});
