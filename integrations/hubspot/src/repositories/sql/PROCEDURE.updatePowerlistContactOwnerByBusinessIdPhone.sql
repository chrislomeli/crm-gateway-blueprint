DELIMITER ;;

DROP PROCEDURE IF EXISTS `updatePowerlistContactOwnerByBusinessIdPhone`;;

CREATE DEFINER=`bshamsian`@`%` PROCEDURE `updatePowerlistContactOwnerByBusinessIdPhone`(IN varBusinessId bigint(19), IN var164PhoneNumber varchar(25), IN varOwnerUserId varchar(25))
BEGIN
# ENG-6033 - Removed the check varOwnerUserId != ownerUserId - Omid Halavi
update powerlistContact
		INNER JOIN powerlist on powerlistContact.powerlistId = powerlist.powerlistId
    set ownerUserId = varOwnerUserId
    where powerlist.businessId = varBusinessId 
		and powerlistContact.phoneNumber164 = var164PhoneNumber;
END ;;
