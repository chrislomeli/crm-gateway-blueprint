DELIMITER ;;

DROP PROCEDURE IF EXISTS `getExternalOwnersByBusinessId`;;

CREATE DEFINER=`bshamsian`@`%` PROCEDURE `getExternalOwnersByBusinessId`(IN varbusinessid bigint(19), IN varcrmid int(25))
BEGIN

SELECT 
    u.userid, u.externalOwnerid, us.email
FROM
    userCRM u 
    JOIN businessusers bu ON bu.userid = u.userid AND bu.isactive = 1
    JOIN users us ON bu.userid = us.userid
WHERE
    bu.businessid = varbusinessid
    AND u.crmID = varcrmid
		AND u.externalOwnerid IS NOT NULL
		AND u.externalOwnerid != '';

END ;;
