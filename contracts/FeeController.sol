// SPDX-License-Identifier: MIT

pragma solidity ^0.8.11;

import "@openzeppelin/contracts/access/AccessControlEnumerable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IFeeController.sol";

/**
 * @title FeeController
 * @author Non-Fungible Technologies, Inc.
 *
 * The Fee Controller is used by LoanCore to query for fees for different
 * loan lifecycle interactions (origiations, rollovers, etc). All fees should
 * have setters and getters and be expressed in BPs. In the future, this contract
 * could be extended to support more complext logic (introducing a mapping of users
 * who get a discount, e.g.). Since LoanCore can change the fee controller reference,
 * any changes to this contract can be newly deployed on-chain and adopted.
 */
contract FeeController is AccessControlEnumerable, IFeeController, Ownable {
    // ============================================ STATE ==============================================

    /// @dev Fee for origination - default is 0.5%
    uint256 private originationFee = 50;
    /// @dev Fee for rollovers - default is 0.1%
    uint256 private rolloverFee = 10;

    // ========================================= FEE SETTERS ===========================================

    /**
     * @notice Set the origination fee to the given value. The caller
     *         must be the owner of the contract.
     *
     * @param _originationFee       The new origination fee, in bps.
     */
    function setOriginationFee(uint256 _originationFee) external override onlyOwner {
        originationFee = _originationFee;
        emit UpdateOriginationFee(_originationFee);
    }

    /**
     * @notice Set the origination fee to the given value. The caller
     *         must be the owner of the contract.
     *
     * @param _rolloverFee          The new rollover fee, in bps.
     */
    function setRolloverFee(uint256 _rolloverFee) external override onlyOwner {
        rolloverFee = _rolloverFee;
        emit UpdateRolloverFee(_rolloverFee);
    }

    // ========================================= FEE GETTERS ===========================================

    /**
     * @notice Get the current origination fee in bps.
     *
     * @return originationFee       The current fee in bps.
     */
    function getOriginationFee() public view override returns (uint256) {
        return originationFee;
    }

    // ========================================= FEE GETTERS ===========================================

    /**
     * @notice Get the current origination fee in bps.
     *
     * @return rolloverFee       The current fee in bps.
     */
    function getRolloverFee() public view override returns (uint256) {
        return rolloverFee;
    }
}
