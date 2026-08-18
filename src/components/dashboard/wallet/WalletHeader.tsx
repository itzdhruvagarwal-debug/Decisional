"use client";
import React from "react";
import { Button } from "@/components/ui";
import { formatCurrency } from "@/lib/utils-client";

export interface WalletData {
  balance: number;
  pendingBalance: number;
  totalEarned: number;
  totalWithdrawn: number;
  totalSpent?: number;
  totalDeposited?: number;
  totalHeld?: number;
}

interface WalletHeaderProps {
  readonly userType: string | null | undefined;
  readonly balance: number;
  readonly isDownloading: Record<string, boolean | undefined>;
  readonly setShowWithdrawModal: (show: boolean) => void;
  readonly setShowAddFundsModal: (show: boolean) => void;
  readonly handleDownloadCSV: () => void;
  readonly handleDownloadIncomeReport: () => void;
  readonly handleDownloadSpendReport: () => void;
}

export function WalletHeader({
  userType,
  balance,
  isDownloading,
  setShowWithdrawModal,
  setShowAddFundsModal,
  handleDownloadCSV,
  handleDownloadIncomeReport,
  handleDownloadSpendReport,
}: WalletHeaderProps) {
  return (
    <div className="flex justify-between items-center mb-8 flex-wrap gap-4">
      <div>
        <h1 className="font-extrabold text-3xl bg-gradient-primary wallet-title">
          Wallet and Payments
        </h1>
        <p className="text-secondary">
          {userType === "BRAND"
            ? "Manage campaign spending, top-ups, and payment history."
            : "Manage earnings, transactions, and payouts."}
        </p>
      </div>

      <div className="flex gap-3 flex-wrap">
        {userType === "BRAND" && (
          <Button variant="secondary" aria-label="Add funds to wallet" onClick={() => setShowAddFundsModal(true)}>
            Add Funds
          </Button>
        )}
        {userType === "INFLUENCER" && (
          <Button
            variant="primary"
            aria-label={balance < 50000 ? "Withdraw (minimum balance not met)" : "Withdraw funds"}
            onClick={() => setShowWithdrawModal(true)}
            disabled={balance < 50000}
          >
            Withdraw
          </Button>
        )}
        <Button
          variant="ghost"
          aria-label={isDownloading["txn"] ? "Downloading transactions" : "Download transactions as CSV"}
          onClick={handleDownloadCSV}
          disabled={!!isDownloading["txn"]}
          data-loading={isDownloading["txn"] ? "true" : "false"}
        >
          {isDownloading["txn"] ? " Downloading" : " Download Transactions"}
        </Button>
        {userType === "INFLUENCER" && (
          <Button
            variant="ghost"
            aria-label={isDownloading["income"] ? "Downloading income report" : "Download income report for ITR"}
            onClick={handleDownloadIncomeReport}
            disabled={!!isDownloading["income"]}
            data-loading={isDownloading["income"] ? "true" : "false"}
          >
            {isDownloading["income"] ? " Downloading" : " Income Report (ITR)"}
          </Button>
        )}
        {userType === "BRAND" && (
          <Button
            variant="ghost"
            aria-label={isDownloading["spend"] ? "Downloading spend report" : "Download spend report for GST"}
            onClick={handleDownloadSpendReport}
            disabled={!!isDownloading["spend"]}
            data-loading={isDownloading["spend"] ? "true" : "false"}
          >
            {isDownloading["spend"] ? " Downloading" : " Spend Report (GST)"}
          </Button>
        )}
      </div>
    </div>
  );
}

interface WalletSummaryCardsProps {
  readonly userType: string | null | undefined;
  readonly walletData: WalletData;
}

export function WalletSummaryCards({ userType, walletData }: WalletSummaryCardsProps) {
  return (
    <div className="grid-4 mb-10">
      <div className="card border-none bg-gradient-primary">
        <div className="text-sm mb-2 opacity-90">Available Balance</div>
        <div className="font-extrabold text-3xl">{formatCurrency(walletData.balance)}</div>
      </div>

      <div className="card">
        <div className="text-sm text-secondary mb-2">
          {userType === "BRAND" ? "Active Holds" : "Pending"}
        </div>
        <div className="font-extrabold text-3xl text-amber">
          {formatCurrency(userType === "BRAND" ? walletData.totalHeld || 0 : walletData.pendingBalance)}
        </div>
      </div>

      <div className="card">
        <div className="text-sm text-secondary mb-2">
          {userType === "BRAND" ? "Total Spent" : "Total Earned"}
        </div>
        <div className="font-extrabold text-3xl text-emerald">
          {formatCurrency(userType === "BRAND" ? walletData.totalSpent || 0 : walletData.totalEarned)}
        </div>
      </div>

      <div className="card">
        <div className="text-sm text-secondary mb-2">
          {userType === "BRAND" ? "Total Added" : "Total Withdrawn"}
        </div>
        <div className="font-extrabold text-3xl">
          {formatCurrency(userType === "BRAND" ? walletData.totalDeposited || 0 : walletData.totalWithdrawn)}
        </div>
      </div>
    </div>
  );
}
