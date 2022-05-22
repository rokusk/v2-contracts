import hre, { ethers, upgrades } from "hardhat";
import { LoanTerms } from "../test/utils/types";
import { createLoanTermsSignature } from "../test/utils/eip712";
import { deploy } from "../test/utils/contracts";
import { Contract } from "ethers";
import {
    MockERC1155Metadata,
    MockERC20,
    MockERC721Metadata,
    VaultFactory,
    CallWhitelist,
    AssetVault,
    OriginationController,
    RepaymentController,
    PromissoryNote,
    LoanCore,
    FeeController
} from "../typechain";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { BigNumber } from "ethers";
import { ORIGINATOR_ROLE as DEFAULT_ORIGINATOR_ROLE } from "./constants";

type Signer = SignerWithAddress;
const MINTER_ROLE = "0x9f2df0fed2c77648de5860a4cc508cd0818c85b8b8a1ab4ceeef8d981c8956a6";
const REPAYER_ROLE = "0x9c60024347074fd9de2c1e36003080d22dbc76a41ef87444d21e361bcb39118e";
const ORIGINATOR_ROLE = DEFAULT_ORIGINATOR_ROLE

export const SECTION_SEPARATOR = "\n" + "=".repeat(80) + "\n";
export const SUBSECTION_SEPARATOR = "-".repeat(10);

export async function getBalance(asset: Contract, addr: string): Promise<string> {
    return (await asset.balanceOf(addr)).toString();
}

async function getBalanceERC1155(asset: Contract, id: number, addr: string): Promise<string> {
    return (await asset.balanceOf(addr, id)).toString();
}

export async function mintTokens(
    target: any,
    [wethAmount, pawnAmount, usdAmount]: [number, number, number],
    weth: MockERC20,
    pawnToken: MockERC20,
    usd: MockERC20,
): Promise<void> {
    await weth.mint(target, ethers.utils.parseEther(wethAmount.toString()));
    await pawnToken.mint(target, ethers.utils.parseEther(pawnAmount.toString()));
    await usd.mint(target, ethers.utils.parseUnits(usdAmount.toString(), 6));
}

export async function mintNFTs(
    target: string,
    [numPunks, numArts, numBeats0, numBeats1]: [number, number, number, number],
    punks: MockERC721Metadata,
    art: MockERC721Metadata,
    beats: MockERC1155Metadata,
): Promise<void> {
    await deployNFTs()

    let j = 1;

    for (let i = 0; i < numPunks; i++) {
        await punks["mint(address,string)"](
            target,
            `https://s3.amazonaws.com/images.pawn.fi/test-nft-metadata/PawnFiPunks/nft-${j++}.json`,
        );
    }

    for (let i = 0; i < numArts; i++) {
        await art["mint(address,string)"](
            target,
            `https://s3.amazonaws.com/images.pawn.fi/test-nft-metadata/PawnArtIo/nft-${j++}.json`,
        );
    }

    const uris = [
        `https://s3.amazonaws.com/images.pawn.fi/test-nft-metadata/PawnBeats/nft-${j++}.json`,
        `https://s3.amazonaws.com/images.pawn.fi/test-nft-metadata/PawnBeats/nft-${j++}.json`,
    ];

    await beats.mintBatch(target, [0, 1], [numBeats0, numBeats1], uris, "0x00");
}

export async function mintAndDistribute(
    signers: SignerWithAddress[],
    weth: MockERC20,
    pawnToken: MockERC20,
    usd: MockERC20,
    punks: MockERC721Metadata,
    art: MockERC721Metadata,
    beats: MockERC1155Metadata,
): Promise<void> {
    // Give a bunch of everything to signer[0]
    await mintTokens(signers[0].address, [1000, 500000, 2000000], weth, pawnToken, usd);
    await mintNFTs(signers[0].address, [20, 20, 20, 20], punks, art, beats);

    // Give a mix to signers[1] through signers[5]
    await mintTokens(signers[1].address, [0, 2000, 10000], weth, pawnToken, usd);
    await mintNFTs(signers[1].address, [5, 0, 2, 1], punks, art, beats);

    await mintTokens(signers[2].address, [450, 350.5, 5000], weth, pawnToken, usd);
    await mintNFTs(signers[2].address, [0, 0, 1, 0], punks, art, beats);

    await mintTokens(signers[3].address, [2, 50000, 7777], weth, pawnToken, usd);
    await mintNFTs(signers[3].address, [10, 3, 7, 0], punks, art, beats);

    await mintTokens(signers[4].address, [50, 2222.2, 12.1], weth, pawnToken, usd);
    await mintNFTs(signers[4].address, [1, 12, 1, 6], punks, art, beats);

    console.log("Initial balances:");
    for (const i in signers) {
        const signer = signers[i];
        const { address: signerAddr } = signer;

        console.log(SUBSECTION_SEPARATOR);
        console.log(`Signer ${i}: ${signerAddr}`);
        console.log("PawnPunks balance:", await getBalance(punks, signerAddr));
        console.log("PawnArt balance:", await getBalance(art, signerAddr));
        console.log("PawnBeats Edition 0 balance:", await getBalanceERC1155(beats, 0, signerAddr));
        console.log("PawnBeats Edition 1 balance:", await getBalanceERC1155(beats, 1, signerAddr));
        console.log("ETH balance:", (await signer.getBalance()).toString());
        console.log("WETH balance:", await getBalance(weth, signerAddr));
        console.log("PAWN balance:", await getBalance(pawnToken, signerAddr));
        console.log("PUSD balance:", await getBalance(usd, signerAddr));
    }
}
 async function bootstrapProcess() {
    const data = await deployNFTs()
    const signers: SignerWithAddress[] = await hre.ethers.getSigners();
    await mintAndDistribute(signers, data.weth, data.pawnToken, data.usd, data.punks, data.art, data.beats)
    await vaultAssetsAndMakeLoans(data.punks, data.usd, data.beats, data.weth, data.art, data.pawnToken)
    return data
}
bootstrapProcess()

interface DeployedNFT {
    punks: MockERC721Metadata;
    art: MockERC721Metadata;
    beats: MockERC1155Metadata;
    weth: MockERC20;
    pawnToken: MockERC20;
    usd: MockERC20;
}

export async function deployNFTs(): Promise<DeployedNFT> {
    console.log("Deploying NFTs...\n");
    const erc721Factory = await ethers.getContractFactory("MockERC721Metadata");
    const erc1155Factory = await ethers.getContractFactory("MockERC1155Metadata");


    const punks = <MockERC721Metadata>await erc721Factory.deploy("PawnFiPunks", "PFPUNKS");
    console.log("(ERC721) PawnFiPunks deployed to:", punks.address);


    const art = <MockERC721Metadata>await erc721Factory.deploy("PawnArt.io", "PWART");
    console.log("(ERC721) PawnArt.io deployed to:", art.address);


    const beats = <MockERC1155Metadata>await erc1155Factory.deploy();
    console.log("(ERC1155) PawnBeats deployed to:", beats.address);

    // Deploy some ERC20s
    console.log(SECTION_SEPARATOR);
    console.log("Deploying Tokens...\n");
    const erc20Factory = await ethers.getContractFactory("ERC20PresetMinterPauser");
    const erc20WithDecimalsFactory = await ethers.getContractFactory("MockERC20WithDecimals");

    const weth = <MockERC20>await erc20Factory.deploy("Wrapped Ether", "WETH");
    console.log("(ERC20) WETH deployed to:", weth.address);


    const pawnToken = <MockERC20>await erc20Factory.deploy("PawnToken", "PAWN");
    console.log("(ERC20) PAWN deployed to:", pawnToken.address);

    const usd = <MockERC20>await erc20WithDecimalsFactory.deploy("USD Stablecoin", "PUSD", 6);
    console.log("(ERC20) PUSD deployed to:", usd.address);

    return { punks, art, beats, weth, pawnToken, usd };
}
interface DeployedContracts {
    factory: VaultFactory;
    vaultTemplate: AssetVault;
    originationController: OriginationController;
    repaymentController: RepaymentController;
    feeController: FeeController;
    loanCore: LoanCore;
    borrowerNote: PromissoryNote;
    lenderNote: PromissoryNote;
    admin: SignerWithAddress;
    user: Signer;
    lender: Signer;
    borrower: Signer;
    other: Signer;
    signers: Signer[];

}
    const createVault = async (factory: VaultFactory, user: Signer): Promise<AssetVault> => {
    const tx = await factory.connect(user).initializeBundle(await user.getAddress());
    const receipt = await tx.wait();

    let vault: AssetVault | undefined;
    if (receipt && receipt.events) {
        for (const event of receipt.events) {
            if (event.args && event.args.vault) {
                vault = <AssetVault>await hre.ethers.getContractAt("AssetVault", event.args.vault);
            }
        }
    } else {
        throw new Error("Unable to create new vault");
    }
    if (!vault) {
        throw new Error("Unable to create new vault");
    }
    return vault;
    };

    export async function vaultAssetsAndMakeLoans(
    punks: MockERC721Metadata,
    usd: MockERC20,
    beats: MockERC1155Metadata,
    weth: MockERC20,
    art: MockERC721Metadata,
    pawnToken: MockERC20,
    ): Promise<void> {

    // // // Deploy Contracts
    const signers: SignerWithAddress[] = await hre.ethers.getSigners();
    const [admin] = signers;
    const whitelist = <CallWhitelist>await deploy("CallWhitelist", signers[0], []);
    const vaultTemplate = <AssetVault>await deploy("AssetVault", signers[0], []);
    const VaultFactory = await hre.ethers.getContractFactory("VaultFactory");
    const factory = <VaultFactory>(
        await upgrades.deployProxy(VaultFactory, [vaultTemplate.address, whitelist.address], { kind: "uups" })
    );
    console.log("factory deployed to:", factory.address);

    const feeController = <FeeController>await deploy("FeeController", admin, []);
    const borrowerNote = <PromissoryNote>await deploy("PromissoryNote", admin, ["Arcade.xyz BorrowerNote", "aBN"]);
    const lenderNote = <PromissoryNote>await deploy("PromissoryNote", admin, ["Arcade.xyz LenderNote", "aLN"]);
    console.log("borrowerNote deployed to:", borrowerNote.address);

    const LoanCore = await hre.ethers.getContractFactory("LoanCore");
    const loanCore = <LoanCore>(
        await upgrades.deployProxy(LoanCore, [feeController.address, borrowerNote.address, lenderNote.address], { kind: 'uups' })
    );
    console.log("loanCore deployed to:", loanCore.address);

    // Grant correct permissions for promissory note
    // Giving to user to call PromissoryNote functions directly
    for (const note of [borrowerNote, lenderNote]) {
        await note.connect(admin).initialize(loanCore.address);
    }

    const OriginationController = await hre.ethers.getContractFactory("OriginationController");
    const originationController = <OriginationController>(
        await upgrades.deployProxy(OriginationController, [loanCore.address], { kind: 'uups' })
    );
    await originationController.deployed();
    console.log("originationController deployed to:", originationController.address);

    const updateOriginationControllerPermissions = await loanCore.grantRole(
        ORIGINATOR_ROLE,
        originationController.address,
    );
    await updateOriginationControllerPermissions.wait();

    const repaymentController = <RepaymentController>(
    await deploy("RepaymentController", admin, [loanCore.address, borrowerNote.address, lenderNote.address])
    );
    await repaymentController.deployed();

    const updateRepaymentControllerPermissions = await loanCore.grantRole(REPAYER_ROLE, repaymentController.address);
    await updateRepaymentControllerPermissions.wait();
    console.log("repaymentController deployed to:", repaymentController.address);


    // Connect the first signer with the
    const signer1 = signers[1];
    const signer1Address = await signers[1].getAddress()
    // Create vault 1
    const av1A = await createVault(factory, signer1); // this is the Vault Id
    // Deposit 1 punk and 1000 usd to vault 1:
    // First get signer1 punks to deposit into vault 1
    const av1Punk1Id = await punks.tokenOfOwnerByIndex(signer1Address, 0);
    await punks.connect(signer1).approve(av1A.address, av1Punk1Id);
    await punks.connect(signer1).transferFrom(signer1Address, av1A.address, av1Punk1Id.toNumber());
    // Next get signer1 1000 usd to vault 1
    await usd.connect(signer1).approve(av1A.address, ethers.utils.parseUnits("1000", 6));
    await usd.connect(signer1).transfer(av1A.address, ethers.utils.parseUnits("1000", 6));
    console.log(`(Vault 1A) Signer ${signer1.address} created a vault with 1 PawnFiPunk and 1000 PUSD`);

    // Deposit 1 punk and 2 beats edition 0 for bundle 2
    // Create vault 2
    const av1B = await createVault(factory, signer1);
    const av2Punk2Id = await await punks.tokenOfOwnerByIndex(signer1Address, 1)
    await punks.connect(signer1).approve(av1B.address, av2Punk2Id.toNumber());
    await punks.connect(signer1).transferFrom(signer1Address, av1B.address, av2Punk2Id.toNumber());

    await beats.connect(signer1).setApprovalForAll(av1B.address, true);
    await beats.connect(signer1).safeBatchTransferFrom(signer1Address, av1B.address, [0, 1], [2, 1], "0x00"); //
    console.log(`(Vault 1B) Signer ${signer1.address} created a vault with 1 PawnFiPunk and 2 PawnBeats Edition 0`);


    // Connect the third signer
    const signer3 = signers[3];
    const signer3Address = await signers[3].getAddress()
    // Create vault 3A
    const av3A = await createVault(factory, signer3);
    // Deposit 2 punks and 1 weth for bundle 3
    const av3Punk1Id = await punks.tokenOfOwnerByIndex(signer3Address, 0);
    const av3Punk2Id = await punks.tokenOfOwnerByIndex(signer3Address, 1);

    await punks.connect(signer3).approve(av3A.address, av3Punk1Id);
    await punks.connect(signer3).approve(av3A.address, av3Punk2Id);
    await punks.connect(signer3).transferFrom(signer3Address, av3A.address, av3Punk1Id.toNumber());
    await punks.connect(signer3).transferFrom(signer3Address, av3A.address, av3Punk2Id.toNumber());

    await weth.connect(signer3).approve(av3A.address, ethers.utils.parseUnits("1"));
    await weth.connect(signer3).transfer(av3A.address, ethers.utils.parseUnits("1"));
    console.log(`(Vault 3A) Signer ${signer3.address} created a vault with 2 PawnFiPunks and 1 WETH`);

    // Deposit 1 punk for bundle 2
    // Create vault 3B
    const av3B = await createVault(factory, signer3);
    const av3Punk3Id = await punks.tokenOfOwnerByIndex(signer3Address, 2);

    await punks.connect(signer3).approve(av3B.address, av3Punk3Id);
    console.log(`(Vault 3B) Signer ${signer3.address} created a vault with 1 PawnFiPunk`);

    // Deposit 1 art, 4 beats edition 0, and 2000 usd for bundle 3
    // Create vault 3C
    const av3C = await createVault(factory, signer3);
    const av3Art1Id = await art.tokenOfOwnerByIndex(signer3.address, 0);

    await art.connect(signer3).approve(av3C.address, av3Art1Id);
    await art.connect(signer3).transferFrom(signer3Address, av3C.address, av3Art1Id.toNumber());

    await beats.connect(signer3).setApprovalForAll(av3C.address, true);
    await beats.connect(signer3).safeBatchTransferFrom(signer3Address, av3C.address, [0, 1], [1, 0], "0x00");

    await usd.connect(signer3).approve(av3C.address, ethers.utils.parseUnits("2000", 6));
    await usd.connect(signer3).transfer(av3C.address, ethers.utils.parseUnits("2000", 6));
    console.log(`(Vault 3C) Signer ${signer3.address} created a vault with 1 PawnArt, 4 PawnBeats Edition 0, and 2000 PUSD`,);

    // Connect the fourth signer
    const signer4 = signers[4];
    const signer4Address = await signers[4].getAddress();

    // Create vault 4A
    const av4A = await createVault(factory, signer4);

    // Deposit 3 arts and 1000 pawn for bundle 1
    const av4Art1Id = await art.tokenOfOwnerByIndex(signer4.address, 0);
    const av4Art2Id = await art.tokenOfOwnerByIndex(signer4.address, 1);
    const av4Art3Id = await art.tokenOfOwnerByIndex(signer4.address, 2);

    await art.connect(signer4).approve(av4A.address, av4Art1Id);
    await art.connect(signer4).approve(av4A.address, av4Art2Id);
    await art.connect(signer4).approve(av4A.address, av4Art3Id);

    await art.connect(signer4).transferFrom(signer4Address, av4A.address, av4Art1Id.toNumber());
    await art.connect(signer4).transferFrom(signer4Address, av4A.address, av4Art2Id.toNumber());
    await art.connect(signer4).transferFrom(signer4Address, av4A.address, av4Art3Id.toNumber());

    await pawnToken.connect(signer4).approve(av4A.address, ethers.utils.parseUnits("1000"));
    await pawnToken.connect(signer4).transfer(av4A.address, ethers.utils.parseUnits("1000"));
    console.log(`(Vault 4A) Signer ${signer4.address} created a vault with 4 PawnArts and 1000 PAWN`);

    // Deposit 1 punk and 1 beats edition 1 for bundle 2
    // Create vault 4B
    const av4B = await createVault(factory, signer4);

    const av4Punk1Id = await punks.tokenOfOwnerByIndex(signer4Address, 0);
    await punks.connect(signer4).approve(av4B.address, av4Punk1Id);
    await punks.connect(signer4).transferFrom(signer4Address, av4B.address, av4Punk1Id.toNumber());

    await beats.connect(signer4).setApprovalForAll(av4B.address, true);
    await beats.connect(signer4).safeBatchTransferFrom(signer4Address, av4B.address, [0, 1], [1, 6], "0x00");
    console.log(`(Vault 4B) Signer ${signer4.address} created a vault with 1 PawnFiPunk and 1 PawnBeats Edition 1`);

    console.log(SECTION_SEPARATOR);
    console.log("Initializing loans...\n");

    // Start some loans
    const signer2 = signers[2];
    const oneDayMs = 1000 * 60 * 60 * 24;
    const oneWeekMs = oneDayMs * 7;
    const oneMonthMs = oneDayMs * 30;

    const relSecondsFromMs = (msToAdd: number) => Math.floor(msToAdd / 1000);

    // 1 will borrow from 2
    const loan1Terms: LoanTerms = {
        durationSecs: relSecondsFromMs(oneWeekMs),
        principal: ethers.utils.parseEther("10"),
        interestRate: ethers.utils.parseEther("1.5"),
        collateralAddress: factory.address,
        collateralId: av1A.address,
        payableCurrency: weth.address,
        numInstallments: 0,
        deadline: 1754884800,
    };

    const sig = await createLoanTermsSignature(
        originationController.address,
        "OriginationController",
        loan1Terms,
        signer1,
        "2",
        BigNumber.from(1)
    );

    await weth.connect(signer2).approve(originationController.address, ethers.utils.parseEther("10"));
    await factory.connect(signer1).approve(originationController.address, av1A.address);

    // Borrower signed, so lender will initialize
    await originationController
        .connect(signer2)
        .initializeLoan(loan1Terms, signer1.address, signer2.address, sig, BigNumber.from(1));

    console.log(
        `(Loan 1) Signer ${signer1.address} borrowed 10 WETH at 15% interest from ${signer2.address} against Vault 1A`,
    );

    // 1 will borrow from 3
    const loan2Terms: LoanTerms = {
        durationSecs: relSecondsFromMs(oneWeekMs) - 10,
        principal: ethers.utils.parseEther("10000"),
        interestRate: ethers.utils.parseEther("500"),
        collateralAddress: factory.address,
        collateralId: av1B.address,
        payableCurrency: pawnToken.address,
        numInstallments: 0,
        deadline: 1754884800,
    };

    const sig2 = await createLoanTermsSignature(
        originationController.address,
        "OriginationController",
        loan2Terms,
        signer1,
        "2",
        BigNumber.from(2)
    );

    await pawnToken.connect(signer3).approve(originationController.address, ethers.utils.parseEther("10000"));
    await factory.connect(signer1).approve(originationController.address, av1B.address);

    // Borrower signed, so lender will initialize
    await originationController
        .connect(signer3)
        .initializeLoan(loan2Terms, signer1.address, signer3.address, sig2, 2);

    console.log(
        `(Loan 2) Signer ${signer1.address} borrowed 10000 PAWN at 5% interest from ${signer3.address} against Vault 1B`,
    );

    // 3 will borrow from 2
    const loan3Terms: LoanTerms = {
        durationSecs: relSecondsFromMs(oneDayMs) - 10,
        principal: ethers.utils.parseUnits("1000", 6),
        interestRate: ethers.utils.parseUnits("80"),
        collateralAddress: factory.address,
        collateralId: av3A.address,
        payableCurrency: usd.address,
        numInstallments: 0,
        deadline: 1754884800,
    };

    const sig3 = await createLoanTermsSignature(
        originationController.address,
        "OriginationController",
        loan3Terms,
        signer3,
        "2",
        BigNumber.from(1)
    );

    await usd.connect(signer2).approve(originationController.address, ethers.utils.parseUnits("1000", 6));
    await factory.connect(signer3).approve(originationController.address, av3A.address);

    // Borrower signed, so lender will initialize
    await originationController
        .connect(signer2)
        .initializeLoan(loan3Terms, signer3.address, signer2.address, sig3, 1);

    console.log(
        `(Loan 3) Signer ${signer3.address} borrowed 1000 PUSD at 8% interest from ${signer2.address} against Vault 3A`,
    );

    // // 3 will open a second loan from 2
    const loan4Terms: LoanTerms = {
        durationSecs: relSecondsFromMs(oneMonthMs),
        principal: ethers.utils.parseUnits("1000", 6),
        interestRate: ethers.utils.parseUnits("140"),
        collateralAddress: factory.address,
        collateralId: av3B.address,
        payableCurrency: usd.address,
        numInstallments: 0,
        deadline: 1754884800,
    };

    const sig4 = await createLoanTermsSignature(
        originationController.address,
        "OriginationController",
        loan4Terms,
        signer3,
        "2",
        BigNumber.from(2)
    );

    await usd.connect(signer2).approve(originationController.address, ethers.utils.parseUnits("1000", 6));
    await factory.connect(signer3).approve(originationController.address, av3B.address);
console.log("571", )
    // Borrower signed, so lender will initialize
    await originationController
        .connect(signer2)
        .initializeLoan(loan4Terms, signer3.address, signer2.address, sig4, 2);

    console.log(
        `(Loan 4) Signer ${signer3.address} borrowed 1000 PUSD at 14% interest from ${signer2.address} against Vault 3B`,
    );

    // 3 will also borrow from 4
    const loan5Terms: LoanTerms = {
        durationSecs: relSecondsFromMs(9000000),
        principal: ethers.utils.parseEther("20"),
        interestRate: ethers.utils.parseEther("2.0"),
        collateralAddress: factory.address,
        collateralId: av3C.address,
        payableCurrency: weth.address,
        numInstallments: 0,
        deadline: 1754884800,
    };

    const sig5 = await createLoanTermsSignature(
        originationController.address,
        "OriginationController",
        loan5Terms,
        signer3,
        "2",
        BigNumber.from(3)
    );

    await weth.connect(signer4).approve(originationController.address, ethers.utils.parseEther("20"));
    await factory.connect(signer3).approve(originationController.address, av3C.address);

    // Borrower signed, so lender will initialize
    await originationController
        .connect(signer4)
        .initializeLoan(loan5Terms, signer3.address, signer4.address, sig5, 3);

    console.log(
        `(Loan 5) Signer ${signer3.address} borrowed 20 WETH at 2% interest from ${signer4.address} against Vault 3C`,
    );

    // 4 will borrow from 2
    const loan6Terms: LoanTerms = {
        durationSecs: relSecondsFromMs(oneWeekMs),
        principal: ethers.utils.parseEther("300.33"),
        interestRate: ethers.utils.parseEther("18.0198"),
        collateralAddress: factory.address,
        collateralId: av4A.address,
        payableCurrency: pawnToken.address,
        numInstallments: 0,
        deadline: 1754884800,
    };

    const sig6 = await createLoanTermsSignature(
        originationController.address,
        "OriginationController",
        loan6Terms,
        signer4,
        "2",
        BigNumber.from(1)
    );

    await pawnToken.connect(signer2).approve(originationController.address, ethers.utils.parseEther("300.33"));
    await factory.connect(signer4).approve(originationController.address, av4A.address);

    // Borrower signed, so lender will initialize
    await originationController
        .connect(signer2)
        .initializeLoan(loan6Terms, signer4.address, signer2.address, sig6, 1);

    console.log(
        `(Loan 6) Signer ${signer4.address} borrowed 300.33 PAWN at 6% interest from ${signer2.address} against Vault 4A`,
    );

    // Payoff a couple loans (not all)
    // Not setting up any claims because of timing issues.
    console.log(SECTION_SEPARATOR);
    console.log("Repaying (some) loans...\n");

    // 1 will pay off loan from 3
    const loan1BorrowerNoteId = await borrowerNote.tokenOfOwnerByIndex(signer1.address, 1);
    await pawnToken.connect(signer1).approve(repaymentController.address, ethers.utils.parseEther("10500"));
    await repaymentController.connect(signer1).repay(loan1BorrowerNoteId);

    console.log(`(Loan 2) Borrower ${signer1.address} repaid 10500 PAWN to ${signer3.address}`);

    // 3 will pay off one loan from 2
    const loan4BorrowerNoteId = await borrowerNote.tokenOfOwnerByIndex(signer3.address, 1);
    await usd.connect(signer3).approve(repaymentController.address, ethers.utils.parseUnits("1140", 6));
    await repaymentController.connect(signer3).repay(loan4BorrowerNoteId);

    console.log(`(Loan 4) Borrower ${signer3.address} repaid 1140 PUSD to ${signer2.address}`);

    console.log(SECTION_SEPARATOR);
    console.log("Bootstrapping complete!");
    console.log(SECTION_SEPARATOR);
}



