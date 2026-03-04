;; ============================================================================
;; Test Token X - SIP-010 Fungible Token
;; ============================================================================
;; A simple test token implementing SIP-010 for DEX testing
;; ============================================================================

(impl-trait .sip010-ft-trait.sip-010-trait)

(define-fungible-token token-x)

(define-constant CONTRACT_OWNER tx-sender)
(define-constant ERR_NOT_AUTHORIZED (err u401))

;; Token metadata
(define-constant TOKEN_NAME "Test Token X")
(define-constant TOKEN_SYMBOL "TSTX")
(define-constant TOKEN_DECIMALS u6)
(define-constant TOKEN_URI none)

;; SIP-010 Implementation

(define-read-only (get-name)
  (ok TOKEN_NAME)
)

(define-read-only (get-symbol)
  (ok TOKEN_SYMBOL)
)

(define-read-only (get-decimals)
  (ok TOKEN_DECIMALS)
)

(define-read-only (get-balance (account principal))
  (ok (ft-get-balance token-x account))
)

(define-read-only (get-total-supply)
  (ok (ft-get-supply token-x))
)

(define-read-only (get-token-uri)
  (ok TOKEN_URI)
)

(define-public (transfer
    (amount uint)
    (sender principal)
    (recipient principal)
    (memo (optional (buff 34)))
  )
  (begin
    (asserts! (is-eq tx-sender sender) ERR_NOT_AUTHORIZED)
    (try! (ft-transfer? token-x amount sender recipient))
    (match memo
      to-print (print to-print)
      0x
    )
    (ok true)
  )
)

;; Mint function for testing
(define-public (mint
    (amount uint)
    (recipient principal)
  )
  (begin
    (asserts! (is-eq tx-sender CONTRACT_OWNER) ERR_NOT_AUTHORIZED)
    (ft-mint? token-x amount recipient)
  )
)

