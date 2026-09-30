import { useCallback, useMemo, useState } from "react";
import { HDNodeWallet, Wallet } from "ethers";
import { wordlists } from "ethers/wordlists";
import * as bip39 from "bip39";

type State = { mnemonic?: string; address?: string; wallet?: Wallet };

export default function useLocalWallet() {
  const [state, setState] = useState<State>({});

  const generate12 = useCallback(async () => {
    const mnemonic = bip39.generateMnemonic(128, undefined, bip39.wordlists.english);
    const hd = HDNodeWallet.fromPhrase(
      mnemonic,
      undefined,
      "m/44'/60'/0'/0/0",
      wordlists.en
    );
    const wallet = new Wallet(hd.privateKey);
    setState({ mnemonic, address: wallet.address, wallet });
    return { mnemonic, address: wallet.address };
  }, []);

  const encryptToKeystore = useCallback(async (password: string) => {
    if (!state.wallet) throw new Error("Wallet not ready");
    return await state.wallet.encrypt(password); // JSON string
  }, [state.wallet]);

  const clearWalletFromMemory = useCallback(() => setState({}), []);

  return useMemo(
    () => ({ ...state, generate12, encryptToKeystore, clearWalletFromMemory }),
    [state, generate12, encryptToKeystore, clearWalletFromMemory]
  );
}
