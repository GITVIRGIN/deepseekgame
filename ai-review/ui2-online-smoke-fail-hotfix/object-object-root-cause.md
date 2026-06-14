# [object Object] Root Cause

## Location

src/app/main.js line 162: 

## Root Cause

The  helper function only accepts 3 args: (tag, className, children).
The call passed 4 args, with the 3rd being an object  intended as HTML attributes.
But  treated the object as a DOM child. When a plain object is appended to DOM,
it is coerced to the string .
The 4th argument (link text) was silently ignored.

## Fix

Replaced the broken  call with direct .
Sets href, target, and textContent explicitly.