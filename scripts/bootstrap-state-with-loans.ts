/* eslint no-unused-vars: 0 */

import { ethers } from "hardhat";

import { main as deploy } from "./deploy";

import { deployNFTs, mintAndDistribute, SECTION_SEPARATOR, vaultAssetsAndMakeLoans } from "./bootstrap-tools";

export async function main(): Promise<void> {
    // Bootstrap five accounts only.
    // Skip the first account, since the
    // first signer will be the deployer.
    const [, ...signers] = (await ethers.getSigners()).slice(1, 7);


    console.log(SECTION_SEPARATOR);
    console.log("Deploying resources...\n");

    // Deploy the smart contracts
    const { vaultFactory, originationController, borrowerNote, repaymentController } = await deploy();


    // Mint some NFTs
    console.log(SECTION_SEPARATOR);
    const { punks, art, beats, weth, pawnToken, usd } = await deployNFTs();

    // Distribute NFTs and ERC20s
    console.log(SECTION_SEPARATOR);
    console.log("Distributing assets...\n");
    await mintAndDistribute(signers, weth, pawnToken, usd, punks, art, beats);

    // Wrap some assets
    console.log(SECTION_SEPARATOR);
    console.log("Vaulting assets...\n");
    await vaultAssetsAndMakeLoans(
        signers,
        vaultFactory,
        originationController,
        borrowerNote,
        repaymentController,
        punks,
        usd,
        beats,
        weth,
        art,
        pawnToken,
    );

    // End state:
    // 0 is clean (but has a bunch of tokens and NFTs)
    // 1 has 2 bundles and 1 open borrow, one closed borrow
    // 2 has two open lends and one closed lend
    // 3 has 3 bundles, two open borrows, one closed borrow, and one closed lend
    // 4 has 1 bundle, an unused bundle, one open lend and one open borrow
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
if (require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch((error: Error) => {
            console.error(error);
            process.exit(1);
        });
}
