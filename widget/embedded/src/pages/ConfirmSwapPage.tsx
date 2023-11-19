/* eslint-disable @typescript-eslint/no-magic-numbers */
import type {
  ConfirmSwap,
  ConfirmSwapFetchResult,
} from '../hooks/useConfirmSwap/useConfirmSwap.types';

import { i18n } from '@lingui/core';
import { useManager } from '@rango-dev/queue-manager-react';
import {
  Alert,
  Button,
  Divider,
  IconButton,
  RefreshIcon,
  SettingsIcon,
  styled,
  Tooltip,
  Typography,
  WalletIcon,
} from '@rango-dev/ui';
import React, { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { useNavigate } from 'react-router-dom';

import { getRequiredWallets } from '../components/ConfirmWalletsModal/ConfirmWallets.helpers';
import { ConfirmWalletsModal } from '../components/ConfirmWalletsModal/ConfirmWalletsModal';
import { HeaderButton } from '../components/HeaderButtons/HeaderButtons.styles';
import { Layout } from '../components/Layout';
import { navigationRoutes } from '../constants/navigationRoutes';
import { getQuoteUpdateWarningMessage } from '../constants/warnings';
import { QuoteInfo } from '../containers/QuoteInfo';
import { useConfirmSwap } from '../hooks/useConfirmSwap';
import { useQuoteStore } from '../store/quote';
import { useUiStore } from '../store/ui';
import { useWalletsStore } from '../store/wallets';
import { QuoteWarningType } from '../types';
import { getContainer } from '../utils/common';

const Container = styled('div', {
  position: 'relative',
  width: '100%',
  '& .description': {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: '$10',
  },
  '& .icon': {
    width: '$24',
    height: '$24',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
  },
});

const Buttons = styled('div', {
  width: '100%',
  display: 'flex',
  justifyContent: 'space-between',
  '& .confirm-button': {
    flexGrow: 1,
    paddingRight: '$10',
  },
  [`& ${IconButton}`]: {
    width: '$48',
    height: '$48',
  },
});

export function ConfirmSwapPage() {
  //TODO: move component's logics to a custom hook
  const {
    quote,
    setInputAmount,
    selectedWallets,
    quoteWalletsConfirmed,
    setQuoteWalletConfirmed,
    customDestination,
    quoteWarningsConfirmed,
  } = useQuoteStore();
  const navigate = useNavigate();
  const [dbErrorMessage, setDbErrorMessage] = useState<string>('');

  const { connectedWallets } = useWalletsStore();
  const showWalletsOnInit = !quoteWalletsConfirmed;
  const [showWallets, setShowWallets] = useState(false);
  const setSelectedSwap = useUiStore.use.setSelectedSwap();
  const { manager } = useManager();
  const {
    fetch: confirmSwap,
    loading: fetchingConfirmationQuote,
    cancelFetch,
  } = useConfirmSwap();
  const [confirmSwapResult, setConfirmSwapResult] =
    useState<ConfirmSwapFetchResult>({
      swap: null,
      error: null,
      warnings: null,
    });

  const [showQuoteWarningModal, setShowQuoteWarningModal] = useState(false);

  const onConfirmSwap: ConfirmSwap['fetch'] = async ({
    selectedWallets,
    customDestination,
  }) => {
    const result = await confirmSwap?.({ selectedWallets, customDestination });
    setConfirmSwapResult(result);
    return result;
  };

  const addNewSwap = async () => {
    if (confirmSwapResult.swap && quoteWalletsConfirmed) {
      try {
        await manager?.create(
          'swap',
          { swapDetails: confirmSwapResult.swap },
          { id: confirmSwapResult.swap.requestId }
        );
        setSelectedSwap(confirmSwapResult.swap.requestId);

        const swap_url = `../${navigationRoutes.swaps}/${confirmSwapResult.swap.requestId}`;
        navigate(swap_url, {
          replace: true,
        });
        setTimeout(() => {
          setInputAmount('');
        }, 0);
      } catch (e) {
        setDbErrorMessage('Error: ' + (e as any)?.message);
      }
    }
  };

  const onConfirm = async () => {
    await addNewSwap();
  };

  const onStartConfirmSwap = async () => {
    if (confirmSwapResult?.warnings?.quote && !quoteWarningsConfirmed) {
      setShowQuoteWarningModal(true);
    } else {
      await onConfirm();
    }
  };

  const onRefresh = async () => {
    setConfirmSwapResult({
      error: null,
      swap: null,
      warnings: null,
    });
    confirmSwap({ selectedWallets })
      .then((res) => {
        setConfirmSwapResult(res);
      })
      .catch((error) => console.error(error));
  };

  useEffect(() => {
    if (showWalletsOnInit) {
      cancelFetch();
    }
  }, [showWalletsOnInit]);

  useEffect(() => {
    if (showWalletsOnInit) {
      setShowWallets(showWalletsOnInit);
    }
  }, [showWalletsOnInit]);

  useEffect(() => {
    if (!showWalletsOnInit) {
      confirmSwap({ selectedWallets, customDestination })
        .then((result) => setConfirmSwapResult(result))
        .catch((error) => console.error(error));
    }
  }, []);

  useEffect(() => {
    const quoteChanged =
      confirmSwapResult.warnings?.quote?.type &&
      Object.values(QuoteWarningType).includes(
        confirmSwapResult.warnings?.quote?.type
      );

    const selectedWalletDisconnected =
      selectedWallets.length < 1 ||
      !selectedWallets.every((selectedWallet) =>
        connectedWallets.find(
          (connectedWallet) =>
            selectedWallet.address === connectedWallet.address &&
            selectedWallet.walletType === connectedWallet.walletType &&
            selectedWallet.chain === connectedWallet.chain
        )
      );

    let quoteWalletsChanged = false;

    if (quoteChanged) {
      let requiredWallets = getRequiredWallets(quote);

      const lastStepToBlockchain =
        quote?.result?.swaps[quote.result.swaps.length - 1].to.blockchain;

      const isLastWalletRequired = !!quote?.result?.swaps.find(
        (swap) => swap.from.blockchain === lastStepToBlockchain
      );

      if (!isLastWalletRequired) {
        requiredWallets = requiredWallets.slice(
          -requiredWallets.length,
          requiredWallets.length - 1
        );
      }

      const allRequiredWalletsSelected = requiredWallets.every(
        (requiredWallet) =>
          selectedWallets.find(
            (selectedWallet) => selectedWallet.chain === requiredWallet
          )
      );

      if (!allRequiredWalletsSelected) {
        quoteWalletsChanged = true;
      }
    }

    if (quote && (selectedWalletDisconnected || quoteWalletsChanged)) {
      queueMicrotask(() => flushSync(setShowWallets.bind(null, true)));
      setQuoteWalletConfirmed(false);
    }
  }, [
    confirmSwapResult.warnings?.quote,
    selectedWallets.length,
    connectedWallets.length,
  ]);

  return (
    <Layout
      header={{
        title: i18n.t('Confirm Swap'),
        onWallet: () => {
          const wallets_url = `../${navigationRoutes.wallets}`;
          navigate(wallets_url);
        },
        suffix: (
          <Tooltip
            container={getContainer()}
            side="bottom"
            content={i18n.t('Settings')}>
            <HeaderButton
              size="small"
              variant="ghost"
              onClick={() => navigate('../' + navigationRoutes.settings)}>
              <SettingsIcon size={18} color="black" />
            </HeaderButton>
          </Tooltip>
        ),
      }}
      footer={
        <Buttons>
          <div className="confirm-button">
            <Button
              variant="contained"
              type="primary"
              size="large"
              fullWidth
              loading={fetchingConfirmationQuote}
              disabled={!!confirmSwapResult.error}
              onClick={onStartConfirmSwap}>
              {i18n.t('Start Swap')}
            </Button>
          </div>
          <IconButton
            variant="contained"
            type="primary"
            size="large"
            loading={fetchingConfirmationQuote}
            onClick={setShowWallets.bind(null, true)}>
            <WalletIcon size={24} />
          </IconButton>
        </Buttons>
      }>
      {showWallets && (
        <ConfirmWalletsModal
          open={showWallets}
          onClose={() => setShowWallets(false)}
          onCancel={cancelFetch}
          loading={fetchingConfirmationQuote}
          onCheckBalance={onConfirmSwap}
        />
      )}

      <Container>
        <div className="description">
          <Typography variant="title" size="small">
            {i18n.t('You get')}
          </Typography>
          <Button
            style={{ padding: '0' }}
            variant="ghost"
            disabled={fetchingConfirmationQuote}
            onClick={onRefresh}>
            <div className="icon">
              <RefreshIcon size={16} />
            </div>
          </Button>
        </div>
        {dbErrorMessage && (
          <>
            <Alert type="error" variant="alarm" title={dbErrorMessage} />
            <Divider size={12} />
          </>
        )}
        {confirmSwapResult.warnings?.quoteUpdate && (
          <>
            <Alert
              variant="alarm"
              type="warning"
              title={
                confirmSwapResult.warnings.quoteUpdate &&
                getQuoteUpdateWarningMessage(
                  confirmSwapResult.warnings.quoteUpdate
                )
              }
            />
            <Divider size={12} />
          </>
        )}
        <QuoteInfo
          quote={quote}
          type="swap-preview"
          expanded={true}
          error={confirmSwapResult.error}
          loading={fetchingConfirmationQuote}
          warning={confirmSwapResult.warnings?.quote ?? null}
          refetchQuote={onRefresh}
          showWarningModal={showQuoteWarningModal}
          onOpenWarningModal={() => setShowQuoteWarningModal(true)}
          onCloseWarningModal={() => setShowQuoteWarningModal(false)}
          onConfirmWarningModal={async () => {
            setShowQuoteWarningModal(false);
            await addNewSwap();
          }}
        />
      </Container>
    </Layout>
  );
}
