import pandas as pd
from sklearn.linear_model import LogisticRegression

def train_calibration_model(audit_df):
    X = audit_df[['dark_fraction', 'longest_gap_m']]
    y = (audit_df['audit_score'] >= 3).astype(int)    
    model = LogisticRegression()
    model.fit(X, y)
    return model