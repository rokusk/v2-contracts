import { ethers } from "hardhat";

import { FlashRollover } from "../typechain";

export interface DeployedResources {
    flashRollover: FlashRollover;
}

// TODO: Set arguments once a new loan core is deployed.
export async function main(
    ADDRESSES_PROVIDER_ADDRESS = "0xB53C1a33016B2DC2fF3653530bfF1848a515c8c5",
    LOAN_CORE_ADDRESS: string,
    LEGACY_LOAN_CORE_ADDRESS = "0x59e57F9A313A2EB1c7357eCc331Ddca14209F403",
    ORIGINATION_CONTROLLER_ADDRESS: string,
    REPAYMENT_CONTROLLER_ADDDRESS: string,
    LEGACY_REPAYMENT_CONTROLLER_ADDRESS = "0x945afF9253C840401166c3d24fF78180Fe0A05df",
    BORROWER_NOTE_ADDRESS: string,
    LEGACY_BORROWER_NOTE_ADDRESS = "0x9B458e2B9c0Cd34A62A26B846f45Eb829aEbC96E",
    LENDER_NOTE_ADDRESS: string,
    LEGACY_LENDER_NOTE_ADDRESS = "0xD96e4D03420aA33a3FE91f57D03D8Ef69dE1e863",
    ASSET_WRAPPER_ADDRESS = "0x1F563CDd688ad47b75E474FDe74E87C643d129b7",
    FEE_CONTROLLER_ADDRESS = "0xfc2b8D5C60c8E8BbF8d6dc685F03193472e39587",
): Promise<DeployedResources> {
    // Hardhat always runs the compile task when running scripts through it.
    // If this runs in a standalone fashion you may want to call compile manually
    // to make sure everything is compiled
    // await run("compile");

    const FlashRolloverFactory = await ethers.getContractFactory("FlashRollover");
    const flashRollover = <FlashRollover>(
        await FlashRolloverFactory.deploy(
            ADDRESSES_PROVIDER_ADDRESS,
            LOAN_CORE_ADDRESS,
            LEGACY_LOAN_CORE_ADDRESS,
            ORIGINATION_CONTROLLER_ADDRESS,
            REPAYMENT_CONTROLLER_ADDDRESS,
            LEGACY_REPAYMENT_CONTROLLER_ADDRESS,
            BORROWER_NOTE_ADDRESS,
            LEGACY_BORROWER_NOTE_ADDRESS,
            LENDER_NOTE_ADDRESS,
            LEGACY_LENDER_NOTE_ADDRESS,
            ASSET_WRAPPER_ADDRESS,
            FEE_CONTROLLER_ADDRESS,
        )
    );

    await flashRollover.deployed();

    console.log("FlashRollover deployed to:", flashRollover.address);

    return { flashRollover };
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
if (require.main === module) {
    // TODO: Enable once we have all addresses
    // main()
    //     .then(() => process.exit(0))
    //     .catch((error: Error) => {
    //         console.error(error);
    //         process.exit(1);
    //     });
}