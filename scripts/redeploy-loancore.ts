import { ethers, upgrades } from "hardhat";

import {
    AssetVault,
    FeeController,
    LoanCore,
    PromissoryNote,
    RepaymentController,
    OriginationController,
} from "../typechain";

import { ORIGINATOR_ROLE as DEFAULT_ORIGINATOR_ROLE, REPAYER_ROLE as DEFAULT_REPAYER_ROLE } from "./constants";

import { SECTION_SEPARATOR } from "./bootstrap-tools";

/**
 *  October 2021: LoanCore Redeploy
 *  This deploy addresses the issue of AssetWrapper re-use.
 *  The following contracts need to be re-deployed for any LoanCore change:
 *      - LoanCore
 *      - BorrowerNote (implicit)
 *      - LenderNote (implicit)
 *      - OriginationController (LoanCore address is immutable)
 *      - RepaymentController (LoanCore address is immutable)
 *
 */

export interface DeployedResources {
    assetVault: AssetVault;
    feeController: FeeController;
    loanCore: LoanCore;
    borrowerNote: PromissoryNote;
    lenderNote: PromissoryNote;
    repaymentController: RepaymentController;
    originationController: OriginationController;
}

export async function main(
    ORIGINATOR_ROLE = DEFAULT_ORIGINATOR_ROLE,
    REPAYER_ROLE = DEFAULT_REPAYER_ROLE,
    ASSET_VAULT_ADDRESS = "0x1F563CDd688ad47b75E474FDe74E87C643d129b7",
    FEE_CONTROLLER_ADDRESS = "0xfc2b8D5C60c8E8BbF8d6dc685F03193472e39587",
): Promise<DeployedResources> {
    console.log(SECTION_SEPARATOR);
    const signers = await ethers.getSigners();
    console.log("Deployer address: ", signers[0].address);
    console.log("Deployer balance: ", (await signers[0].getBalance()).toString());
    console.log(SECTION_SEPARATOR);

    // Hardhat always runs the compile task when running scripts through it.
    // If this runs in a standalone fashion you may want to call compile manually
    // to make sure everything is compiled
    // await run("compile");

    // Attach to existing contracts
    const AssetVaultFactory = await ethers.getContractFactory("AssetVault");
    const assetVault = <AssetVault>await AssetVaultFactory.attach(ASSET_VAULT_ADDRESS);


    const FeeControllerFactory = await ethers.getContractFactory("FeeController");
    const feeController = <FeeController>await FeeControllerFactory.attach(FEE_CONTROLLER_ADDRESS);

    // Start deploying new contracts
    const PromissoryNoteFactory = await ethers.getContractFactory("PromissoryNote");
    const borrowerNote = <PromissoryNote>await PromissoryNoteFactory.deploy("Arcade.xyz BorrowerNote", "aBN");
    await borrowerNote.deployed()
    const lenderNote = <PromissoryNote>await PromissoryNoteFactory.deploy("Arcade.xyz LenderNote", "aLN");
    await lenderNote.deployed()
    console.log("BorrowerNote deployed to:", borrowerNote.address);
    console.log("LenderNote deployed to:", lenderNote.address);

    const LoanCoreFactory = await ethers.getContractFactory("LoanCore");
    const loanCore = <LoanCore>await upgrades.deployProxy(LoanCoreFactory, [FEE_CONTROLLER_ADDRESS, borrowerNote.address, lenderNote.address], { kind: "uups" });
    await loanCore.deployed();

    console.log("LoanCore deployed to:", loanCore.address);
    console.log("BorrowerNote deployed to:", borrowerNote.address);
    console.log("LenderNote deployed to:", lenderNote.address);

    const RepaymentControllerFactory = await ethers.getContractFactory("RepaymentController");
    const repaymentController = <RepaymentController>(
        await RepaymentControllerFactory.deploy(loanCore.address, borrowerNote.address, lenderNote.address)
    );
    await repaymentController.deployed();
    const updateRepaymentControllerPermissions = await loanCore.grantRole(REPAYER_ROLE, repaymentController.address);
    await updateRepaymentControllerPermissions.wait();

    console.log("RepaymentController deployed to:", repaymentController.address);

    const OriginationControllerFactory = await ethers.getContractFactory("OriginationController");
    const originationController = <OriginationController>(
        await upgrades.deployProxy(OriginationControllerFactory, [loanCore.address], { kind: "uups" })
    );
    await originationController.deployed();

    const updateOriginationControllerPermissions = await loanCore.grantRole(
        ORIGINATOR_ROLE,
        originationController.address,
    );
    await updateOriginationControllerPermissions.wait();

    console.log("OriginationController deployed to:", originationController.address);

    return {
        assetVault,
        feeController,
        loanCore,
        borrowerNote,
        lenderNote,
        repaymentController,
        originationController,
    };
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
