# Version Source Diagnosis

## Root Cause

The header renders  at src/app/main.js line 132.
 =  (without -UI2 suffix).
 =  (correct label).

## Fix

Changed line 132 from  to .

## Additional Note

src/core/version.js already had label: V3.13N-TM-T2A5F-UI2 but UI was reading app field instead.