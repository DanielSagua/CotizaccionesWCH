USE [CotizacionesDB];
GO

IF OBJECT_ID('dbo.SolicitudesComentarios','U') IS NOT NULL
  DROP TABLE dbo.SolicitudesComentarios;
GO

CREATE TABLE dbo.SolicitudesComentarios (
  id_comentario   INT IDENTITY(1,1) PRIMARY KEY,
  id_solicitud    INT NOT NULL,
  actor_user_id   INT NOT NULL,
  comentario      NVARCHAR(MAX) NOT NULL,
  created_at_utc  DATETIMEOFFSET(0) NOT NULL
    DEFAULT TODATETIMEOFFSET(SYSUTCDATETIME(), '+00:00'),

  CONSTRAINT FK_Com_Solicitud FOREIGN KEY (id_solicitud) REFERENCES dbo.Solicitudes(id_solicitud),
  CONSTRAINT FK_Com_Actor     FOREIGN KEY (actor_user_id) REFERENCES dbo.Users(id_user)
);

CREATE INDEX IX_Com_Solicitud ON dbo.SolicitudesComentarios(id_solicitud, created_at_utc DESC);
GO
