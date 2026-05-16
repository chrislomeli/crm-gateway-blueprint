DELIMITER ;;

DROP PROCEDURE IF EXISTS `getPortalIdByAccessToken`;;

CREATE DEFINER=`bshamsian`@`%` PROCEDURE `getPortalIdByAccessToken`(varaccesstoken VARCHAR ( 225 ))
BEGIN
	SELECT	* 
	FROM	userCRM 
	WHERE	token = varaccesstoken 
			LIMIT 1;
END ;;
