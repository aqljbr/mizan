# Design K: "Evidence Upload Portal" (review this screen as it is)

**Screen 1: New Engagement Form**
Title: "Create Engagement (EngagementSpec)"
25 required fields (all marked *): Company legal name*, Trade licence no.*, Industry code (ISIC)*, Problem statement*, Mission*, Vision*, KPI 1*, KPI 1 unit*, KPI 1 horizon*, KPI 2*, KPI 2 unit*, KPI 2 horizon*, Constraint 1*, Constraint 2*, Constraint 3*, Budget*, Currency*, Decision owner*, Decision owner email*, Data owner*, Data owner email*, Scope in*, Scope out*, Risk appetite (1–10)*, Preferred methodology*.
Button: [Submit]. The form can't be saved part-way.

**Screen 2: Evidence Upload**
Header: "Upload EvidenceItems for M02 critical gaps"
List:
- ● gap_01 sales_tx (provenance class: observed) (red dot)
- ● gap_02 cust_master (green dot)
- ● gap_03 mkt_spend_ts (red dot)

Upload area: a large dashed box "Drag files here". There is no button.
After upload, if the file doesn't match: a toast shows "Error 422: schema mismatch" for 3 seconds.
Note in the footer: "Session expires after 10 minutes of inactivity."

**Screen 3: Status**
"Engagement #A7F3: processing". A spinner. Nothing else.
