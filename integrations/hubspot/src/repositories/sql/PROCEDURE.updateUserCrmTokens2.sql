DELIMITER ;;

DROP PROCEDURE IF EXISTS `updateUserCrmTokens2`;;

CREATE DEFINER=`bshamsian`@`%` PROCEDURE `updateUserCrmTokens2`(IN in_userid BIGINT(19), IN in_crmID BIGINT(19), IN in_accessToken VARCHAR(2048), IN in_tokenValidUntil DATETIME)
BEGIN
	UPDATE userCRM SET accessToken = in_accessToken, tokenvaliduntil = in_tokenValidUntil
    WHERE userid = in_userid AND crmID = in_crmID;
END ;;
